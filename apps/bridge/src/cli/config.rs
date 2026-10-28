use std::io;
use std::path::{Path, PathBuf};

use serde::Deserialize;

const DEFAULT_PORT: u16 = 47821;
const DEFAULT_RETENTION_DAYS: u32 = 7;
const CONFIG_FILE_NAME: &str = "config.toml";
const CONFIG_DIR_ENV: &str = "HERDR_PLUGIN_CONFIG_DIR";

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("cannot read config {}: {source}", path.display())]
    Read { path: PathBuf, source: io::Error },
    #[error("invalid config {}: {source}", path.display())]
    Parse {
        path: PathBuf,
        source: toml::de::Error,
    },
    #[error("extension_id must be 32 letters from a to p")]
    InvalidExtensionId,
    #[error("port must be 1-65535")]
    InvalidPort,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub port: u16,
    pub retention_days: u32,
    pub extension_id: String,
    pub auto_update: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfigFile {
    port: Option<u16>,
    retention_days: Option<u32>,
    extension_id: Option<String>,
    auto_update: Option<bool>,
}

fn is_valid_extension_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| (b'a'..=b'p').contains(&b))
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: DEFAULT_PORT,
            retention_days: DEFAULT_RETENTION_DAYS,
            extension_id: crate::extension_id::bundled_extension_id(),
            auto_update: true,
        }
    }
}

impl Config {
    pub fn load(explicit: Option<&Path>, config_dir: Option<&Path>) -> Result<Config, ConfigError> {
        let path = match explicit {
            Some(path) => path.to_path_buf(),
            None => match config_dir.map(|dir| dir.join(CONFIG_FILE_NAME)) {
                Some(path) if path.is_file() => path,
                _ => return Ok(Config::default()),
            },
        };
        let text = std::fs::read_to_string(&path).map_err(|source| ConfigError::Read {
            path: path.clone(),
            source,
        })?;
        let file: ConfigFile =
            toml::from_str(&text).map_err(|source| ConfigError::Parse { path, source })?;
        let defaults = Config::default();
        if file
            .extension_id
            .as_deref()
            .is_some_and(|id| !is_valid_extension_id(id))
        {
            return Err(ConfigError::InvalidExtensionId);
        }
        if file.port == Some(0) {
            return Err(ConfigError::InvalidPort);
        }
        Ok(Config {
            port: file.port.unwrap_or(defaults.port),
            retention_days: file.retention_days.unwrap_or(defaults.retention_days),
            extension_id: file.extension_id.unwrap_or(defaults.extension_id),
            auto_update: file.auto_update.unwrap_or(defaults.auto_update),
        })
    }

    pub fn from_env(explicit: Option<&Path>) -> Result<Config, ConfigError> {
        let dir = std::env::var_os(CONFIG_DIR_ENV).map(PathBuf::from);
        Config::load(explicit, dir.as_deref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn config_load_table() {
        let dir = TempDir::new().unwrap();
        let defaults = Config::load(None, Some(dir.path())).unwrap();
        assert_eq!(defaults.port, 47821);
        assert_eq!(defaults.retention_days, 7);
        assert!(defaults.auto_update);
        assert_eq!(
            defaults.extension_id,
            crate::extension_id::bundled_extension_id()
        );

        fs::write(dir.path().join("config.toml"), "port = 50000").unwrap();
        assert_eq!(Config::load(None, Some(dir.path())).unwrap().port, 50000);

        let explicit = dir.path().join("other.toml");
        fs::write(&explicit, "port = 50001").unwrap();
        assert_eq!(
            Config::load(Some(&explicit), Some(dir.path()))
                .unwrap()
                .port,
            50001
        );

        fs::write(&explicit, "auto_update = false").unwrap();
        assert!(
            !Config::load(Some(&explicit), Some(dir.path()))
                .unwrap()
                .auto_update
        );

        fs::write(&explicit, "colour = \"red\"").unwrap();
        assert!(matches!(
            Config::load(Some(&explicit), Some(dir.path())),
            Err(ConfigError::Parse { .. })
        ));

        fs::write(&explicit, "extension_id = \"abc\"").unwrap();
        assert!(matches!(
            Config::load(Some(&explicit), Some(dir.path())),
            Err(ConfigError::InvalidExtensionId)
        ));

        fs::write(&explicit, "port = 0").unwrap();
        assert!(matches!(
            Config::load(Some(&explicit), Some(dir.path())),
            Err(ConfigError::InvalidPort)
        ));
    }
}
