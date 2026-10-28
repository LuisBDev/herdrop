use std::path::PathBuf;
use std::process::ExitCode;

use jiff::Timestamp;
use serde::Deserialize;

use super::config::Config;
use super::paths::home_dir;
use super::status::notify;
use super::stderr_log;
use crate::adapters::fs_store::FsBundleStore;
use crate::domain::folder::EffectiveFolder;
use crate::domain::retention::RetentionPolicy;
use crate::ports::{BundleLocation, Machine};

const CONTEXT_ENV: &str = "HERDR_PLUGIN_CONTEXT_JSON";
const NO_FOLDER: &str = "No pane folder";
const NOT_LOCAL: &str = "Pane folder not found on this PC";

#[derive(Deserialize)]
struct PluginContext {
    focused_pane_cwd: Option<String>,
}

fn focused_pane_cwd() -> Option<String> {
    let raw = std::env::var(CONTEXT_ENV).ok()?;
    let context: PluginContext = serde_json::from_str(&raw).ok()?;
    context.focused_pane_cwd.filter(|cwd| !cwd.is_empty())
}

async fn is_local_dir(cwd: &str) -> bool {
    tokio::fs::metadata(cwd)
        .await
        .is_ok_and(|metadata| metadata.is_dir())
}

async fn prune_folder(cwd: String, config: &Config) -> Result<usize, String> {
    let store = FsBundleStore {
        home: home_dir().map_err(|error| error.to_string())?,
    };
    let location = BundleLocation {
        machine: Machine::Local,
        folder: EffectiveFolder::Path(cwd),
    };
    let policy = RetentionPolicy::from_days(config.retention_days);
    store
        .prune(&location, Timestamp::now(), &policy)
        .await
        .map_err(|error| error.to_string())
}

pub async fn run(config: Option<PathBuf>) -> ExitCode {
    stderr_log::init();
    let config = match Config::from_env(config.as_deref()) {
        Ok(config) => config,
        Err(error) => {
            eprintln!("Prune failed: {error}");
            return ExitCode::FAILURE;
        }
    };
    let text = match focused_pane_cwd() {
        None => NO_FOLDER.to_owned(),
        Some(cwd) if !is_local_dir(&cwd).await => NOT_LOCAL.to_owned(),
        Some(cwd) => match prune_folder(cwd, &config).await {
            Ok(count) => format!("Pruned {count} old drops"),
            Err(error) => {
                eprintln!("Prune failed: {error}");
                return ExitCode::FAILURE;
            }
        },
    };
    println!("{text}");
    notify::show(&text).await;
    ExitCode::SUCCESS
}
