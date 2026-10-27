use std::future::Future;

use jiff::Timestamp;

use crate::domain::bundle::Bundle;
use crate::domain::folder::EffectiveFolder;
use crate::domain::ids::{DropId, MachineKey, PaneId};
use crate::domain::retention::RetentionPolicy;
use crate::protocol::{AgentStatus, FolderKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentRecord {
    pub pane_id: PaneId,
    pub name: String,
    pub kind: Option<String>,
    pub status: AgentStatus,
    pub focused: bool,
    pub folder: EffectiveFolder,
    pub folder_kind: FolderKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MachineProfile {
    pub key: MachineKey,
    pub label: String,
    pub ssh_target: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Machine {
    Local,
    Remote(MachineProfile),
}

impl Machine {
    pub fn key(&self) -> MachineKey {
        match self {
            Self::Local => MachineKey::local(),
            Self::Remote(profile) => profile.key.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundleLocation {
    pub machine: Machine,
    pub folder: EffectiveFolder,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WrittenBundle {
    pub dir: String,
    pub readme: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptOutcome {
    Delivered,
    NoActivity,
    AgentBlocked,
    AgentGone,
}

#[derive(Debug, thiserror::Error)]
pub enum DirectoryError {
    #[error("herdr not found")]
    HerdrMissing,
    #[error("unknown machine {0}")]
    UnknownMachine(String),
    #[error("{0}")]
    Command(String),
    #[error("unexpected herdr output: {0}")]
    Parse(String),
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("ssh: {0}")]
    Ssh(String),
}

#[derive(Debug, thiserror::Error)]
pub enum PromptError {
    #[error("herdr not found")]
    HerdrMissing,
    #[error("{0}")]
    Command(String),
}

pub trait AgentDirectory: Send + Sync + 'static {
    fn machines(&self) -> impl Future<Output = Result<Vec<MachineProfile>, DirectoryError>> + Send;
    fn agents(
        &self,
        machine: &Machine,
    ) -> impl Future<Output = Result<Vec<AgentRecord>, DirectoryError>> + Send;
}

pub trait BundleStore: Send + Sync + 'static {
    fn write(
        &self,
        location: &BundleLocation,
        id: &DropId,
        bundle: &Bundle,
        now: Timestamp,
        policy: &RetentionPolicy,
    ) -> impl Future<Output = Result<WrittenBundle, StoreError>> + Send;
    fn prune(
        &self,
        location: &BundleLocation,
        now: Timestamp,
        policy: &RetentionPolicy,
    ) -> impl Future<Output = Result<usize, StoreError>> + Send;
}

pub trait AgentPrompter: Send + Sync + 'static {
    fn prompt(
        &self,
        machine: &Machine,
        pane: &PaneId,
        line: &str,
    ) -> impl Future<Output = Result<PromptOutcome, PromptError>> + Send;
}
