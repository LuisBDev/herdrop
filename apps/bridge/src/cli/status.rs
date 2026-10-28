use std::path::{Path, PathBuf};
use std::process::ExitCode;

use super::config::Config;
use super::paths::StatePaths;
use super::{probe, stderr_log};
use crate::protocol::Health;

pub(super) mod notify;

pub async fn run(port: Option<u16>, config: Option<PathBuf>) -> ExitCode {
    stderr_log::init();
    let port = match port {
        Some(port) => port,
        None => match Config::from_env(config.as_deref()) {
            Ok(config) => config.port,
            Err(error) => {
                eprintln!("{error}");
                return ExitCode::FAILURE;
            }
        },
    };
    let extension_dir = StatePaths::from_env().extension_dir();
    let text = match probe::bridge(port).await {
        Some(health) => running_text(port, &health, &extension_dir),
        None => "Bridge not running".to_owned(),
    };
    println!("{text}");
    notify::show(&text).await;
    ExitCode::SUCCESS
}

fn running_text(port: u16, health: &Health, extension_dir: &Path) -> String {
    let bridge = format!("Bridge running on 127.0.0.1:{port}, v{}", health.version);
    match &health.extension_version {
        Some(version) => format!(
            "{bridge}. Extension v{version} at {}",
            extension_dir.display()
        ),
        None => format!("{bridge}. No extension at {}", extension_dir.display()),
    }
}
