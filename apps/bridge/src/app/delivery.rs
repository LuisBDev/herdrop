use std::sync::Arc;

use tracing::Instrument;

use crate::app::bridge::Bridge;
use crate::app::registry::{Admission, DropRecord, RestartError};
use crate::domain::folder::EffectiveFolder;
use crate::domain::ids::DropId;
use crate::domain::prompt::prompt_line;
use crate::ports::{
    AgentDirectory, AgentPrompter, BundleLocation, BundleStore, PromptOutcome, WrittenBundle,
};
use crate::protocol::{AgentStatus, DropState, DropStep};

struct Outcome {
    state: DropState,
    step: DropStep,
    message: Option<String>,
}

impl Outcome {
    fn new(state: DropState, step: DropStep) -> Self {
        Self {
            state,
            step,
            message: None,
        }
    }

    fn failed(step: DropStep, message: String) -> Self {
        Self {
            state: DropState::Failed,
            step,
            message: Some(message),
        }
    }
}

impl<D: AgentDirectory, S: BundleStore, P: AgentPrompter> Bridge<D, S, P> {
    pub fn start(self: &Arc<Self>, record: DropRecord) -> DropId {
        match self.drops.admit(record) {
            Admission::Created(id) => {
                self.spawn_run(id.clone());
                id
            }
            Admission::Existing(id) => id,
        }
    }

    pub fn retry(self: &Arc<Self>, id: &DropId) -> Result<(), RestartError> {
        self.drops.restart(id)?;
        self.spawn_run(id.clone());
        Ok(())
    }

    fn spawn_run(self: &Arc<Self>, id: DropId) {
        tokio::spawn(Arc::clone(self).run(id));
    }

    pub async fn run(self: Arc<Self>, id: DropId) {
        let Some(record) = self.drops.get(&id) else {
            return;
        };
        let span = tracing::info_span!(
            "drop",
            drop_id = %record.id,
            machine = %record.machine.key(),
            pane = %record.pane,
        );
        async move {
            let outcome = self.deliver(&record).await;
            tracing::info!(state = ?outcome.state, step = ?outcome.step, "drop finished");
            self.drops.update(&record.id, |stored| {
                stored.state = outcome.state;
                stored.step = outcome.step;
                stored.message = outcome.message;
            });
        }
        .instrument(span)
        .await;
    }

    fn enter(&self, id: &DropId, step: DropStep) {
        self.drops.update(id, |stored| {
            stored.state = DropState::Running;
            stored.step = step;
        });
    }

    async fn deliver(&self, record: &DropRecord) -> Outcome {
        self.enter(&record.id, DropStep::CheckAgent);
        let agents = match self.directory.agents(&record.machine).await {
            Ok(agents) => agents,
            Err(error) => return Outcome::failed(DropStep::CheckAgent, error.to_string()),
        };
        let Some(agent) = agents
            .into_iter()
            .find(|agent| agent.pane_id == record.pane)
        else {
            return Outcome::new(DropState::AgentGone, DropStep::CheckAgent);
        };
        if agent.status == AgentStatus::Blocked {
            return Outcome::new(DropState::AgentBlocked, DropStep::CheckAgent);
        }
        let written = match &record.written {
            Some(written) => written.clone(),
            None => match self.write(record, agent.folder).await {
                Ok(written) => written,
                Err(outcome) => return outcome,
            },
        };
        self.prompt(record, &written).await
    }

    async fn write(
        &self,
        record: &DropRecord,
        folder: EffectiveFolder,
    ) -> Result<WrittenBundle, Outcome> {
        self.enter(&record.id, DropStep::WriteBundle);
        let location = BundleLocation {
            machine: record.machine.clone(),
            folder,
        };
        let written = self
            .store
            .write(
                &location,
                &record.id,
                &record.bundle,
                self.now(),
                &self.retention,
            )
            .await
            .map_err(|error| Outcome::failed(DropStep::WriteBundle, error.to_string()))?;
        self.drops.update(&record.id, |stored| {
            stored.written = Some(written.clone());
        });
        Ok(written)
    }

    async fn prompt(&self, record: &DropRecord, written: &WrittenBundle) -> Outcome {
        self.enter(&record.id, DropStep::PromptAgent);
        let line = prompt_line(&written.readme);
        match self
            .prompter
            .prompt(&record.machine, &record.pane, &line)
            .await
        {
            Ok(PromptOutcome::Delivered) => {
                Outcome::new(DropState::Delivered, DropStep::WaitActivity)
            }
            Ok(PromptOutcome::NoActivity) => {
                Outcome::new(DropState::SentNoActivity, DropStep::WaitActivity)
            }
            Ok(PromptOutcome::AgentBlocked) => {
                Outcome::new(DropState::AgentBlocked, DropStep::PromptAgent)
            }
            Ok(PromptOutcome::AgentGone) => {
                Outcome::new(DropState::AgentGone, DropStep::PromptAgent)
            }
            Err(error) => Outcome::failed(DropStep::PromptAgent, error.to_string()),
        }
    }
}
