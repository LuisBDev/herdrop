use std::path::PathBuf;
use std::process::ExitCode;

use jiff::Timestamp;
use serde::Deserialize;

use super::config::Config;
use super::paths::home_dir;
use super::status::notify;
use super::stderr_log;
use crate::adapters::fs_store::FsBundleStore;
use crate::adapters::herdr_cli::HerdrCli;
use crate::domain::folder::EffectiveFolder;
use crate::domain::retention::RetentionPolicy;
use crate::ports::{BundleLocation, Machine};

const CONTEXT_ENV: &str = "HERDR_PLUGIN_CONTEXT_JSON";
const NO_FOLDER: &str = "No pane folder";
const NOT_LOCAL: &str = "Pane folder not found on this PC";

#[derive(Deserialize)]
struct PluginContext {
    focused_pane_id: Option<String>,
    focused_pane_cwd: Option<String>,
}

struct FocusedPane {
    id: Option<String>,
    cwd: String,
}

fn focused_pane() -> Option<FocusedPane> {
    let raw = std::env::var(CONTEXT_ENV).ok()?;
    let context: PluginContext = serde_json::from_str(&raw).ok()?;
    let cwd = context.focused_pane_cwd.filter(|cwd| !cwd.is_empty())?;
    Some(FocusedPane {
        id: context.focused_pane_id,
        cwd,
    })
}

async fn is_local_dir(cwd: &str) -> bool {
    tokio::fs::metadata(cwd)
        .await
        .is_ok_and(|metadata| metadata.is_dir())
}

async fn is_local_pane(pane: &FocusedPane) -> bool {
    match HerdrCli::from_env().local_pane_ids().await {
        Ok(ids) => pane
            .id
            .as_deref()
            .is_some_and(|id| ids.iter().any(|pane_id| pane_id == id)),
        Err(error) => {
            tracing::warn!(%error, "local herdr pane list unavailable, checking the folder instead");
            is_local_dir(&pane.cwd).await
        }
    }
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
    let text = match focused_pane() {
        None => NO_FOLDER.to_owned(),
        Some(pane) if !is_local_pane(&pane).await => NOT_LOCAL.to_owned(),
        Some(pane) => match prune_folder(pane.cwd, &config).await {
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
