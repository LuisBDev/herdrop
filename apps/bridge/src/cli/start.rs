mod detach;

use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Duration;

use crate::cli::config::{Config, ConfigError};
use crate::cli::paths::{PidRecord, StatePaths};
use crate::cli::probe;
use crate::cli::stop::{self, StopError};

const POLL_INTERVAL: Duration = Duration::from_millis(100);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, thiserror::Error)]
enum StartError {
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error("cannot create state folder {}: {source}", path.display())]
    StateDir { path: PathBuf, source: io::Error },
    #[cfg(windows)]
    #[error("cannot stop handle inheritance: {0}")]
    Inheritance(io::Error),
    #[error("cannot resolve the config path: {0}")]
    ConfigPath(io::Error),
    #[error("cannot locate the herdrop executable: {0}")]
    CurrentExe(io::Error),
    #[error("cannot spawn the bridge: {0}")]
    Spawn(io::Error),
    #[error("cannot write pid file {}: {source}", path.display())]
    PidFile { path: PathBuf, source: io::Error },
    #[error("cannot remove pid file {}: {source}", path.display())]
    RemovePid { path: PathBuf, source: io::Error },
    #[error("cannot stop the unanswered bridge: {0}")]
    StopChild(io::Error),
    #[error(
        "herdrop {version} answers on 127.0.0.1:{port}, but {} does not name it, so start leaves it running; stop that bridge, then run start again",
        pid_file.display()
    )]
    Unrecorded {
        port: u16,
        version: String,
        pid_file: PathBuf,
    },
    #[error(
        "herdrop {version} on 127.0.0.1:{port} did not stop, so herdrop {} cannot start",
        VERSION
    )]
    StillAnswering { port: u16, version: String },
    #[error(transparent)]
    Stop(#[from] StopError),
}

const VERSION: &str = env!("CARGO_PKG_VERSION");

enum Outcome {
    AlreadyRunning(u16),
    Running(u16),
    Replaced { port: u16, previous: String },
    NoAnswer { port: u16, log: PathBuf },
}

pub async fn run(port: Option<u16>, config: Option<PathBuf>, no_warm: bool) -> ExitCode {
    match start(port, config.as_deref(), no_warm).await {
        Ok(Outcome::AlreadyRunning(port)) => {
            println!("herdrop already running on 127.0.0.1:{port}");
            ExitCode::SUCCESS
        }
        Ok(Outcome::Running(port)) => {
            println!("herdrop running on 127.0.0.1:{port}");
            ExitCode::SUCCESS
        }
        Ok(Outcome::Replaced { port, previous }) => {
            println!("herdrop {VERSION} replaced herdrop {previous} on 127.0.0.1:{port}");
            ExitCode::SUCCESS
        }
        Ok(Outcome::NoAnswer { port, log }) => {
            println!(
                "herdrop did not answer on 127.0.0.1:{port} within 5 s; see {}",
                log.display()
            );
            ExitCode::FAILURE
        }
        Err(error) => {
            eprintln!("herdrop start failed: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn start(
    port: Option<u16>,
    config_path: Option<&Path>,
    no_warm: bool,
) -> Result<Outcome, StartError> {
    let config = Config::from_env(config_path)?;
    let port = port.unwrap_or(config.port);
    let state = StatePaths::from_env();
    let previous = match probe::bridge(port).await {
        Some(running) if running.version == VERSION => return Ok(Outcome::AlreadyRunning(port)),
        Some(running) => {
            replace(&state, port, running.version.clone()).await?;
            Some(running.version)
        }
        None => None,
    };
    state.ensure().map_err(|source| StartError::StateDir {
        path: state.dir.clone(),
        source,
    })?;
    #[cfg(windows)]
    detach::disable_std_handle_inheritance().map_err(StartError::Inheritance)?;
    let exe = std::env::current_exe().map_err(StartError::CurrentExe)?;
    let log = state.log_file();
    let config_path = config_path
        .map(std::path::absolute)
        .transpose()
        .map_err(StartError::ConfigPath)?;
    let args = serve_args(port, &log, config_path.as_deref(), no_warm);
    let mut child = detach::spawn_serve(&exe, &args, &state.dir).map_err(StartError::Spawn)?;
    let pid_file = state.pid_file();
    if !wait_for_health(port).await {
        if matches!(child.try_wait(), Ok(None)) {
            child.kill().map_err(StartError::StopChild)?;
            child.wait().map_err(StartError::StopChild)?;
        }
        PidRecord::remove(&pid_file).map_err(|source| StartError::RemovePid {
            path: pid_file,
            source,
        })?;
        return Ok(Outcome::NoAnswer { port, log });
    }
    if matches!(child.try_wait(), Ok(Some(_))) {
        return Ok(Outcome::AlreadyRunning(port));
    }
    PidRecord {
        pid: child.id(),
        port,
    }
    .write(&pid_file)
    .map_err(|source| StartError::PidFile {
        path: pid_file,
        source,
    })?;
    Ok(match previous {
        Some(previous) => Outcome::Replaced { port, previous },
        None => Outcome::Running(port),
    })
}

async fn replace(state: &StatePaths, port: u16, version: String) -> Result<(), StartError> {
    let pid_file = state.pid_file();
    let recorded = PidRecord::read(&pid_file)
        .ok()
        .flatten()
        .filter(|record| record.port == port);
    let Some(record) = recorded else {
        return Err(StartError::Unrecorded {
            port,
            version,
            pid_file,
        });
    };
    stop::stop_recorded(record, &pid_file).await?;
    if probe::health(port).await {
        return Err(StartError::StillAnswering { port, version });
    }
    Ok(())
}

fn serve_args(port: u16, log: &Path, config: Option<&Path>, no_warm: bool) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec![
        "serve".into(),
        "--port".into(),
        port.to_string().into(),
        "--log-file".into(),
        log.into(),
    ];
    if let Some(config) = config {
        args.push("--config".into());
        args.push(config.into());
    }
    if no_warm {
        args.push("--no-warm".into());
    }
    args
}

async fn wait_for_health(port: u16) -> bool {
    let polling = async {
        while !probe::health(port).await {
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    };
    tokio::time::timeout(STARTUP_TIMEOUT, polling).await.is_ok()
}
