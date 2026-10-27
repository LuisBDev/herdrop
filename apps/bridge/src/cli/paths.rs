use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const STATE_DIR_ENV: &str = "HERDR_PLUGIN_STATE_DIR";

#[derive(Debug, thiserror::Error)]
pub enum PathsError {
    #[error("cannot determine the home folder")]
    NoHome,
}

pub fn home_dir() -> Result<PathBuf, PathsError> {
    std::env::home_dir().ok_or(PathsError::NoHome)
}

#[derive(Debug, Clone)]
pub struct StatePaths {
    pub dir: PathBuf,
}

impl StatePaths {
    pub fn from_env() -> Self {
        let dir = std::env::var_os(STATE_DIR_ENV)
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("herdrop"));
        Self { dir }
    }

    pub fn pid_file(&self) -> PathBuf {
        self.dir.join("herdrop.pid")
    }

    pub fn log_file(&self) -> PathBuf {
        self.dir.join("herdrop.log")
    }

    pub fn ensure(&self) -> io::Result<()> {
        std::fs::create_dir_all(&self.dir)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PidRecord {
    pub pid: u32,
    pub port: u16,
}

impl PidRecord {
    pub fn read(path: &Path) -> Result<Option<PidRecord>, io::Error> {
        match std::fs::read_to_string(path) {
            Ok(text) => Ok(serde_json::from_str(&text).ok()),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(err) => Err(err),
        }
    }

    pub fn write(&self, path: &Path) -> Result<(), io::Error> {
        let text = serde_json::to_string(self).map_err(io::Error::other)?;
        std::fs::write(path, text)
    }

    pub fn remove(path: &Path) -> Result<(), io::Error> {
        match std::fs::remove_file(path) {
            Err(err) if err.kind() != io::ErrorKind::NotFound => Err(err),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn pid_record_round_trips_and_missing_or_garbage_reads_none() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("herdrop.pid");
        assert_eq!(PidRecord::read(&path).unwrap(), None);

        let record = PidRecord {
            pid: 42,
            port: 47821,
        };
        record.write(&path).unwrap();
        assert_eq!(PidRecord::read(&path).unwrap(), Some(record));

        fs::write(&path, "garbage").unwrap();
        assert_eq!(PidRecord::read(&path).unwrap(), None);

        PidRecord::remove(&path).unwrap();
        PidRecord::remove(&path).unwrap();
    }
}
