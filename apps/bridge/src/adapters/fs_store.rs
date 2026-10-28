use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use jiff::Timestamp;
use tokio::fs;
use tokio::io::AsyncWriteExt;

use crate::domain::bundle::Bundle;
use crate::domain::folder::EffectiveFolder;
use crate::domain::ids::DropId;
use crate::domain::retention::{RetentionPolicy, prune_candidates};
use crate::ports::{BundleLocation, BundleStore, Machine, StoreError, WrittenBundle};

const HERDROP_DIR: &str = ".herdrop";
const DROP_DIR: &str = "drop";
const GITIGNORE: &str = ".gitignore";
const GITIGNORE_CONTENT: &str = "*\n";
const README: &str = "README.md";
const TMP_PREFIX: &str = ".tmp-";
const REMOTE_UNSUPPORTED: &str = "remote machine requires the ssh store";

#[derive(Debug, Clone)]
pub struct FsBundleStore {
    pub home: PathBuf,
}

impl FsBundleStore {
    fn root(&self, location: &BundleLocation) -> Result<PathBuf, StoreError> {
        if let Machine::Remote(_) = location.machine {
            return Err(StoreError::Ssh(REMOTE_UNSUPPORTED.to_owned()));
        }
        Ok(match &location.folder {
            EffectiveFolder::Path(path) => Path::new(path).join(HERDROP_DIR),
            EffectiveFolder::Home => self.home.join(HERDROP_DIR),
        })
    }

    pub async fn prune(
        &self,
        location: &BundleLocation,
        now: Timestamp,
        policy: &RetentionPolicy,
    ) -> Result<usize, StoreError> {
        let drop = self.root(location)?.join(DROP_DIR);
        let keep = DropId::generate(now, &mut fastrand::Rng::with_seed(0));
        match prune_dir(&drop, &keep, now, policy).await {
            Err(StoreError::Io(error)) if error.kind() == ErrorKind::NotFound => Ok(0),
            other => other,
        }
    }
}

impl BundleStore for FsBundleStore {
    async fn write(
        &self,
        location: &BundleLocation,
        id: &DropId,
        bundle: &Bundle,
        now: Timestamp,
        policy: &RetentionPolicy,
    ) -> Result<WrittenBundle, StoreError> {
        let root = self.root(location)?;
        let drop = root.join(DROP_DIR);
        fs::create_dir_all(&drop).await?;
        ensure_gitignore(&root.join(GITIGNORE)).await?;
        let staging = drop.join(format!("{TMP_PREFIX}{id}"));
        let dir = drop.join(id.as_str());
        if let Err(error) = stage(&staging, &dir, bundle).await {
            let _ = fs::remove_dir_all(&staging).await;
            return Err(error);
        }
        if let Err(error) = prune_dir(&drop, id, now, policy).await {
            tracing::warn!(drop_id = %id, %error, "bundle prune failed");
        }
        Ok(WrittenBundle {
            readme: dir.join(README).display().to_string(),
            dir: dir.display().to_string(),
        })
    }
}

async fn stage(staging: &Path, dir: &Path, bundle: &Bundle) -> Result<(), StoreError> {
    match fs::remove_dir_all(staging).await {
        Err(error) if error.kind() != ErrorKind::NotFound => return Err(error.into()),
        _ => {}
    }
    fs::create_dir(staging).await?;
    for (name, content) in bundle.files() {
        fs::write(staging.join(name.as_str()), content).await?;
    }
    fs::rename(staging, dir).await?;
    Ok(())
}

async fn ensure_gitignore(path: &Path) -> Result<(), StoreError> {
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .await
    {
        Ok(mut file) => {
            file.write_all(GITIGNORE_CONTENT.as_bytes()).await?;
            file.flush().await?;
            Ok(())
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error.into()),
    }
}

async fn prune_dir(
    drop: &Path,
    keep: &DropId,
    now: Timestamp,
    policy: &RetentionPolicy,
) -> Result<usize, StoreError> {
    let mut names = Vec::new();
    let mut entries = fs::read_dir(drop).await?;
    while let Some(entry) = entries.next_entry().await? {
        if let Ok(name) = entry.file_name().into_string() {
            names.push(name);
        }
    }
    let doomed = prune_candidates(names.iter().map(String::as_str), keep, now, policy);
    for name in &doomed {
        let path = drop.join(name);
        if fs::symlink_metadata(&path).await?.is_dir() {
            fs::remove_dir_all(&path).await?;
        } else {
            fs::remove_file(&path).await?;
        }
        tracing::debug!(entry = %name, "pruned bundle entry");
    }
    Ok(doomed.len())
}
