use jiff::Timestamp;

use crate::adapters::fs_store::FsBundleStore;
use crate::adapters::ssh_store::SshBundleStore;
use crate::domain::bundle::Bundle;
use crate::domain::ids::DropId;
use crate::domain::retention::RetentionPolicy;
use crate::ports::{BundleLocation, BundleStore, Machine, StoreError, WrittenBundle};

#[derive(Debug, Clone)]
pub struct MachineBundleStore {
    pub local: FsBundleStore,
    pub ssh: SshBundleStore,
}

impl BundleStore for MachineBundleStore {
    async fn write(
        &self,
        location: &BundleLocation,
        id: &DropId,
        bundle: &Bundle,
        now: Timestamp,
        policy: &RetentionPolicy,
    ) -> Result<WrittenBundle, StoreError> {
        match location.machine {
            Machine::Local => self.local.write(location, id, bundle, now, policy).await,
            Machine::Remote(_) => self.ssh.write(location, id, bundle, now, policy).await,
        }
    }
}
