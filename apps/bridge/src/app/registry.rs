use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use crate::domain::bundle::Bundle;
use crate::domain::ids::{ClientRequestId, DropId, PaneId};
use crate::ports::{Machine, WrittenBundle};
use crate::protocol::{DropState, DropStatus, DropStep};

pub const MAX_DROPS: usize = 200;

#[derive(Debug, Clone)]
pub struct DropRecord {
    pub id: DropId,
    pub request_id: ClientRequestId,
    pub machine: Machine,
    pub pane: PaneId,
    pub state: DropState,
    pub step: DropStep,
    pub written: Option<WrittenBundle>,
    pub message: Option<String>,
    pub bundle: Arc<Bundle>,
}

impl DropRecord {
    pub fn status(&self) -> DropStatus {
        DropStatus {
            drop_id: self.id.as_str().to_owned(),
            machine: self.machine.key().as_str().to_owned(),
            pane_id: self.pane.as_str().to_owned(),
            state: self.state,
            step: self.step,
            bundle_dir: self.written.as_ref().map(|written| written.dir.clone()),
            message: self.message.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Admission {
    Created(DropId),
    Existing(DropId),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum RestartError {
    #[error("drop not found")]
    NotFound,
    #[error("drop is not retryable")]
    NotRetryable,
}

#[derive(Default)]
struct RegistryState {
    records: HashMap<DropId, DropRecord>,
    by_request: HashMap<ClientRequestId, DropId>,
    order: VecDeque<DropId>,
}

impl RegistryState {
    fn evict_oldest(&mut self) {
        while self.order.len() > MAX_DROPS {
            let Some(index) = self.order.iter().position(|id| {
                self.records
                    .get(id)
                    .is_none_or(|record| record.state != DropState::Running)
            }) else {
                return;
            };
            if let Some(oldest) = self.order.remove(index)
                && let Some(record) = self.records.remove(&oldest)
            {
                self.by_request.remove(&record.request_id);
            }
        }
    }
}

#[derive(Default)]
pub struct DropRegistry {
    state: Mutex<RegistryState>,
}

impl DropRegistry {
    fn lock(&self) -> MutexGuard<'_, RegistryState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn find_by_request(&self, request_id: &ClientRequestId) -> Option<DropId> {
        self.lock().by_request.get(request_id).cloned()
    }

    pub fn admit(&self, mut record: DropRecord, mut fresh_id: impl FnMut() -> DropId) -> Admission {
        let mut state = self.lock();
        if let Some(existing) = state.by_request.get(&record.request_id) {
            return Admission::Existing(existing.clone());
        }
        while state.records.contains_key(&record.id) {
            record.id = fresh_id();
        }
        let id = record.id.clone();
        state
            .by_request
            .insert(record.request_id.clone(), id.clone());
        state.order.push_back(id.clone());
        state.records.insert(id.clone(), record);
        state.evict_oldest();
        Admission::Created(id)
    }

    pub fn get(&self, id: &DropId) -> Option<DropRecord> {
        self.lock().records.get(id).cloned()
    }

    pub fn update(&self, id: &DropId, change: impl FnOnce(&mut DropRecord)) {
        if let Some(record) = self.lock().records.get_mut(id) {
            change(record);
        }
    }

    pub fn restart(&self, id: &DropId) -> Result<(), RestartError> {
        let mut state = self.lock();
        let record = state.records.get_mut(id).ok_or(RestartError::NotFound)?;
        match record.state {
            DropState::Running | DropState::Delivered => Err(RestartError::NotRetryable),
            DropState::SentNoActivity
            | DropState::AgentGone
            | DropState::AgentBlocked
            | DropState::Failed => {
                record.state = DropState::Running;
                record.step = DropStep::CheckAgent;
                record.message = None;
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::bundle::BundleFileName;

    fn record(id: &str, request: &str, state: DropState) -> DropRecord {
        let name = |raw: &str| raw.parse::<BundleFileName>().expect("valid name");
        let files = vec![
            (name("README.md"), String::new()),
            (name("A1.md"), String::new()),
        ];
        DropRecord {
            id: id.parse().expect("valid id"),
            request_id: request.parse().expect("valid request id"),
            machine: Machine::Local,
            pane: "w1:p1".parse().expect("valid pane"),
            state,
            step: DropStep::CheckAgent,
            written: None,
            message: None,
            bundle: Arc::new(Bundle::new(files).expect("valid bundle")),
        }
    }

    fn letters(index: usize) -> String {
        const ALPHABET: &[u8; 26] = b"abcdefghijklmnopqrstuvwxyz";
        (0..4u32)
            .rev()
            .map(|place| char::from(ALPHABET[index / 26usize.pow(place) % 26]))
            .collect()
    }

    fn unused() -> DropId {
        unreachable!("the id is free")
    }

    #[test]
    fn admit_regenerates_taken_ids_and_eviction_keeps_running_drops() {
        let registry = DropRegistry::default();
        let running = "20261027-000000-aaaa";
        registry.admit(record(running, "r-running", DropState::Running), unused);

        let regenerated = "20261027-000000-bbbb";
        let admission = registry.admit(record(running, "r-collides", DropState::Failed), || {
            regenerated.parse().expect("valid id")
        });

        assert_eq!(
            admission,
            Admission::Created(regenerated.parse().expect("valid id"))
        );
        assert_eq!(
            registry
                .get(&running.parse().expect("valid id"))
                .map(|stored| stored.state),
            Some(DropState::Running)
        );

        for index in 0..MAX_DROPS {
            let id = format!("20261027-000001-{}", letters(index));
            registry.admit(
                record(&id, &format!("r-{index}"), DropState::Delivered),
                unused,
            );
        }

        assert!(registry.get(&running.parse().expect("valid id")).is_some());
        assert!(
            registry
                .get(&regenerated.parse().expect("valid id"))
                .is_none()
        );
    }
}
