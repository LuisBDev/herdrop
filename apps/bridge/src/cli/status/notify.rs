use std::ffi::OsString;
use std::io::ErrorKind;
use std::time::Duration;

use crate::process::background;

const BIN_ENV: &str = "HERDR_BIN_PATH";
const DEFAULT_BIN: &str = "herdr";
const TITLE: &str = "Herdrop";
const TIMEOUT: Duration = Duration::from_secs(10);

pub(crate) async fn show(body: &str) {
    let bin = std::env::var_os(BIN_ENV)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| OsString::from(DEFAULT_BIN));
    let mut command = background(bin);
    command.args(["notification", "show", TITLE, "--body", body]);
    match tokio::time::timeout(TIMEOUT, command.output()).await {
        Err(_) => tracing::warn!("herdr notification timed out"),
        Ok(Err(error)) if error.kind() == ErrorKind::NotFound => {
            tracing::warn!("herdr notification skipped: herdr not found");
        }
        Ok(Err(error)) => tracing::warn!(%error, "herdr notification failed"),
        Ok(Ok(output)) if !output.status.success() => {
            tracing::warn!(status = %output.status, "herdr notification exited with failure");
        }
        Ok(Ok(_)) => {}
    }
}
