use std::sync::Arc;

use jiff::Timestamp;

use crate::app::catalog::AgentCatalog;
use crate::domain::retention::RetentionPolicy;
use crate::ports::{AgentDirectory, AgentPrompter, BundleStore};

pub type Clock = Arc<dyn Fn() -> Timestamp + Send + Sync>;

pub struct Bridge<D, S, P> {
    pub directory: Arc<D>,
    pub store: Arc<S>,
    pub prompter: Arc<P>,
    pub retention: RetentionPolicy,
    pub clock: Clock,
    pub catalog: AgentCatalog,
}

impl<D: AgentDirectory, S: BundleStore, P: AgentPrompter> Bridge<D, S, P> {
    pub fn new(
        directory: Arc<D>,
        store: Arc<S>,
        prompter: Arc<P>,
        retention: RetentionPolicy,
        clock: Clock,
    ) -> Self {
        Self {
            directory,
            store,
            prompter,
            retention,
            clock,
            catalog: AgentCatalog::default(),
        }
    }

    pub fn now(&self) -> Timestamp {
        (self.clock)()
    }
}
