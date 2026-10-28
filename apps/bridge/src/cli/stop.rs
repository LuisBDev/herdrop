mod process_info;

use std::io;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use crate::cli::paths::{PidRecord, StatePaths};
use crate::cli::probe;
use crate::process::background;

const POLL_INTERVAL: Duration = Duration::from_millis(100);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
const KILL_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, thiserror::Error)]
enum StopError {
    #[error("cannot read pid file {}: {source}", path.display())]
    ReadPid { path: PathBuf, source: io::Error },
    #[error("cannot remove pid file {}: {source}", path.display())]
    RemovePid { path: PathBuf, source: io::Error },
}

enum Outcome {
    NotRunning,
    Stale,
    Stopped,
    StillRunning,
}

pub async fn run() -> ExitCode {
    match stop().await {
        Ok(Outcome::NotRunning) => {
            println!("herdrop is not running");
            ExitCode::SUCCESS
        }
        Ok(Outcome::Stale) => {
            println!("herdrop is not running (removed a stale pid file)");
            ExitCode::SUCCESS
        }
        Ok(Outcome::Stopped) => {
            println!("herdrop stopped");
            ExitCode::SUCCESS
        }
        Ok(Outcome::StillRunning) => {
            println!("herdrop did not stop");
            ExitCode::FAILURE
        }
        Err(error) => {
            eprintln!("herdrop stop failed: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn stop() -> Result<Outcome, StopError> {
    let pid_file = StatePaths::from_env().pid_file();
    let record = PidRecord::read(&pid_file).map_err(|source| StopError::ReadPid {
        path: pid_file.clone(),
        source,
    })?;
    let Some(record) = record else {
        return Ok(Outcome::NotRunning);
    };
    let outcome = if is_verified_bridge(record).await {
        kill(record.pid).await;
        if !wait_for_shutdown(record.port).await {
            return Ok(Outcome::StillRunning);
        }
        Outcome::Stopped
    } else {
        Outcome::Stale
    };
    PidRecord::remove(&pid_file).map_err(|source| StopError::RemovePid {
        path: pid_file,
        source,
    })?;
    Ok(outcome)
}

async fn is_verified_bridge(record: PidRecord) -> bool {
    if !probe::health(record.port).await {
        return false;
    }
    process_info::image_name(record.pid)
        .await
        .is_some_and(|name| process_info::is_herdrop_image(&name))
}

#[cfg(windows)]
fn kill_command(pid: u32) -> tokio::process::Command {
    let mut command = background("taskkill");
    command.args(["/PID", &pid.to_string(), "/T", "/F"]);
    command
}

#[cfg(not(windows))]
fn kill_command(pid: u32) -> tokio::process::Command {
    let mut command = background("kill");
    command.args(["-TERM", &pid.to_string()]);
    command
}

async fn kill(pid: u32) {
    let mut command = kill_command(pid);
    match tokio::time::timeout(KILL_TIMEOUT, command.output()).await {
        Ok(Ok(output)) if output.status.success() => {}
        Ok(Ok(output)) => {
            tracing::warn!(pid, status = %output.status, "kill exited with failure");
        }
        Ok(Err(error)) => tracing::warn!(pid, %error, "kill failed"),
        Err(_) => tracing::warn!(pid, "kill timed out"),
    }
}

async fn wait_for_shutdown(port: u16) -> bool {
    let polling = async {
        while probe::health(port).await {
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    };
    tokio::time::timeout(SHUTDOWN_TIMEOUT, polling)
        .await
        .is_ok()
}
