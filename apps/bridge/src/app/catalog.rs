use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use jiff::{SignedDuration, Timestamp};
use tokio::sync::watch;

use crate::app::bridge::Bridge;
use crate::domain::ids::MachineKey;
use crate::http::error::ApiFailure;
use crate::ports::{
    AgentDirectory, AgentPrompter, AgentRecord, BundleStore, DirectoryError, Machine,
    MachineProfile,
};
use crate::protocol::{AgentView, AgentsResponse, MachineView, MachinesResponse};

pub const AGENTS_FRESH_FOR: SignedDuration = SignedDuration::from_secs(10);

struct Entry {
    agents: Vec<AgentRecord>,
    refreshed_at: Option<Timestamp>,
    checked_at: Option<Timestamp>,
    error: Option<String>,
    in_flight: bool,
    done: watch::Sender<u64>,
}

impl Default for Entry {
    fn default() -> Self {
        Self {
            agents: Vec::new(),
            refreshed_at: None,
            checked_at: None,
            error: None,
            in_flight: false,
            done: watch::Sender::new(0),
        }
    }
}

impl Entry {
    fn is_stale(&self, now: Timestamp) -> bool {
        self.checked_at
            .is_none_or(|checked| now.duration_since(checked) >= AGENTS_FRESH_FOR)
    }

    fn response(&self, key: &MachineKey) -> AgentsResponse {
        let (focused, rest): (Vec<_>, Vec<_>) = self.agents.iter().partition(|agent| agent.focused);
        AgentsResponse {
            machine: key.as_str().to_owned(),
            agents: focused.into_iter().chain(rest).map(view).collect(),
            refreshed_at: self.refreshed_at.map(|at| at.to_string()),
            refreshing: self.in_flight,
            error: self.error.clone(),
        }
    }
}

fn view(agent: &AgentRecord) -> AgentView {
    AgentView {
        pane_id: agent.pane_id.as_str().to_owned(),
        name: agent.name.clone(),
        kind: agent.kind.clone(),
        status: agent.status,
        focused: agent.focused,
        folder: agent.folder.display(),
        folder_kind: agent.folder_kind,
    }
}

struct FirstLoad {
    start: bool,
    seen: u64,
    done: watch::Receiver<u64>,
}

#[derive(Default)]
struct CatalogState {
    roster: Vec<MachineProfile>,
    entries: HashMap<MachineKey, Entry>,
}

#[derive(Default)]
pub struct AgentCatalog {
    state: Mutex<CatalogState>,
}

impl AgentCatalog {
    fn lock(&self) -> MutexGuard<'_, CatalogState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn set_roster(&self, roster: Vec<MachineProfile>) {
        self.lock().roster = roster;
    }

    fn roster(&self) -> Vec<MachineProfile> {
        self.lock().roster.clone()
    }

    fn find(&self, key: &MachineKey) -> Option<MachineProfile> {
        self.lock()
            .roster
            .iter()
            .find(|profile| &profile.key == key)
            .cloned()
    }

    fn first_load(&self, key: &MachineKey) -> Option<FirstLoad> {
        let mut state = self.lock();
        let entry = state.entries.entry(key.clone()).or_default();
        if entry.checked_at.is_some() {
            return None;
        }
        let done = entry.done.subscribe();
        let seen = *done.borrow();
        let start = !entry.in_flight;
        entry.in_flight = true;
        Some(FirstLoad { start, seen, done })
    }

    fn claim(&self, key: &MachineKey, force: bool, now: Timestamp) -> (bool, AgentsResponse) {
        let mut state = self.lock();
        let entry = state.entries.entry(key.clone()).or_default();
        let start = !entry.in_flight && (force || entry.is_stale(now));
        if start {
            entry.in_flight = true;
        }
        (start, entry.response(key))
    }

    fn snapshot(&self, key: &MachineKey) -> AgentsResponse {
        let mut state = self.lock();
        state.entries.entry(key.clone()).or_default().response(key)
    }

    pub(crate) fn finish(
        &self,
        key: &MachineKey,
        result: Result<Vec<AgentRecord>, DirectoryError>,
        now: Timestamp,
    ) {
        let mut state = self.lock();
        let entry = state.entries.entry(key.clone()).or_default();
        match result {
            Ok(agents) => {
                entry.agents = agents;
                entry.refreshed_at = Some(now);
                entry.error = None;
            }
            Err(error) => {
                tracing::warn!(machine = %key, error = %error, "agent refresh failed");
                entry.error = Some(error.to_string());
            }
        }
        entry.in_flight = false;
        entry.checked_at = Some(now);
        entry.done.send_modify(|count| *count += 1);
    }
}

fn local_view() -> MachineView {
    let key = MachineKey::local();
    MachineView {
        key: key.as_str().to_owned(),
        label: key.as_str().to_owned(),
        local: true,
    }
}

impl<D: AgentDirectory, S: BundleStore, P: AgentPrompter> Bridge<D, S, P> {
    pub async fn machines(&self) -> MachinesResponse {
        let mut machines = vec![local_view()];
        match self.directory.machines().await {
            Ok(profiles) => {
                machines.extend(
                    profiles
                        .iter()
                        .filter(|profile| !profile.key.is_local())
                        .map(|profile| MachineView {
                            key: profile.key.as_str().to_owned(),
                            label: profile.label.clone(),
                            local: false,
                        }),
                );
                self.catalog.set_roster(profiles);
                MachinesResponse {
                    machines,
                    error: None,
                }
            }
            Err(error) => MachinesResponse {
                machines,
                error: Some(error.to_string()),
            },
        }
    }

    pub async fn resolve(&self, key: &MachineKey) -> Result<Machine, ApiFailure> {
        if key.is_local() {
            return Ok(Machine::Local);
        }
        if let Some(profile) = self.catalog.find(key) {
            return Ok(Machine::Remote(profile));
        }
        let profiles = self
            .directory
            .machines()
            .await
            .map_err(|_| ApiFailure::unknown_machine(key.as_str()))?;
        self.catalog.set_roster(profiles);
        self.catalog
            .find(key)
            .map(Machine::Remote)
            .ok_or_else(|| ApiFailure::unknown_machine(key.as_str()))
    }

    pub async fn agents(
        self: &Arc<Self>,
        key: &MachineKey,
        force: bool,
    ) -> Result<AgentsResponse, ApiFailure> {
        let machine = self.resolve(key).await?;
        let key = machine.key();
        let first = match machine {
            Machine::Local => self.catalog.first_load(&key),
            Machine::Remote(_) => None,
        };
        if let Some(FirstLoad {
            start,
            seen,
            mut done,
        }) = first
        {
            if start {
                self.spawn_refresh(machine);
            }
            let _ = done.wait_for(|count| *count > seen).await;
            return Ok(self.catalog.snapshot(&key));
        }
        let (start, response) = self.catalog.claim(&key, force, self.now());
        if start {
            self.spawn_refresh(machine);
        }
        Ok(response)
    }

    pub async fn warm(self: &Arc<Self>) {
        let _ = self.machines().await;
        let machines =
            std::iter::once(Machine::Local).chain(self.catalog.roster().into_iter().filter_map(
                |profile| (!profile.key.is_local()).then_some(Machine::Remote(profile)),
            ));
        for machine in machines {
            let (start, _) = self.catalog.claim(&machine.key(), false, self.now());
            if start {
                self.spawn_refresh(machine);
            }
        }
    }

    fn spawn_refresh(self: &Arc<Self>, machine: Machine) {
        let bridge = Arc::clone(self);
        tokio::spawn(async move {
            let result = bridge.directory.agents(&machine).await;
            let now = bridge.now();
            bridge.catalog.finish(&machine.key(), result, now);
        });
    }
}
