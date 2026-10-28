use std::ffi::OsString;
use std::io;
use std::path::PathBuf;
use std::process::{ExitStatus, Output};
use std::time::Duration;

use serde::Deserialize;
use tokio::time::{Instant, MissedTickBehavior};

use crate::cli::detach;
use crate::process::background;

const FIRST_CHECK: Duration = Duration::from_secs(60);
const PERIOD: Duration = Duration::from_secs(60 * 60);
const LIST_TIMEOUT: Duration = Duration::from_secs(30);
const UPDATE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const IDLE_WAIT: Duration = Duration::from_secs(5 * 60);
const IDLE_POLL: Duration = Duration::from_secs(5);
const PLUGIN_ID: &str = "herdrop";
const VERSION: &str = env!("CARGO_PKG_VERSION");
#[cfg(windows)]
const START_ACTION: &str = "start-windows";
#[cfg(not(windows))]
const START_ACTION: &str = "start";

#[derive(Debug, thiserror::Error)]
enum HerdrError {
    #[error("cannot run herdr: {0}")]
    Spawn(#[from] io::Error),
    #[error("herdr timed out")]
    TimedOut,
    #[error("herdr exited with {status}: {stderr}")]
    Failed { status: ExitStatus, stderr: String },
    #[error("unexpected plugin list output: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("herdr does not list the {PLUGIN_ID} plugin")]
    NotInstalled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Install {
    GitHub { version: String },
    Other,
}

#[derive(Deserialize)]
struct ListResponse {
    result: ListResult,
}

#[derive(Deserialize)]
struct ListResult {
    plugins: Vec<ListedPlugin>,
}

#[derive(Deserialize)]
struct ListedPlugin {
    plugin_id: String,
    version: String,
    source: Source,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Source {
    Github,
    #[serde(other)]
    Other,
}

fn parse_install(stdout: &[u8]) -> Result<Install, HerdrError> {
    let response: ListResponse = serde_json::from_slice(stdout)?;
    let plugin = response
        .result
        .plugins
        .into_iter()
        .find(|plugin| plugin.plugin_id == PLUGIN_ID)
        .ok_or(HerdrError::NotInstalled)?;
    Ok(match plugin.source {
        Source::Github => Install::GitHub {
            version: plugin.version,
        },
        Source::Other => Install::Other,
    })
}

fn newer_install(install: &Install) -> Option<&str> {
    match install {
        Install::GitHub { version } if version != VERSION => Some(version),
        Install::GitHub { .. } | Install::Other => None,
    }
}

pub(super) struct Updater<F> {
    pub herdr: PathBuf,
    pub busy: F,
}

impl<F: Fn() -> bool + Send + Sync + 'static> Updater<F> {
    pub(super) fn spawn(self) {
        tokio::spawn(async move {
            let mut ticks = tokio::time::interval_at(Instant::now() + FIRST_CHECK, PERIOD);
            ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);
            loop {
                ticks.tick().await;
                self.tick().await;
            }
        });
    }

    async fn tick(&self) {
        match self.install().await {
            Ok(Install::GitHub { .. }) => {}
            Ok(Install::Other) => {
                tracing::info!("auto-update skipped: herdrop is not installed from GitHub");
                return;
            }
            Err(error) => {
                tracing::warn!(%error, "auto-update cannot read the herdrop install");
                return;
            }
        }
        self.update().await;
        let install = match self.install().await {
            Ok(install) => install,
            Err(error) => {
                tracing::warn!(%error, "auto-update cannot read the herdrop install");
                return;
            }
        };
        let Some(version) = newer_install(&install) else {
            return;
        };
        if self.wait_until_idle().await {
            self.restart(version);
        } else {
            tracing::info!(%version, "herdrop update installed; restart waits for running drops");
        }
    }

    async fn install(&self) -> Result<Install, HerdrError> {
        let output = self
            .run(
                &["plugin", "list", "--plugin", PLUGIN_ID, "--json"],
                LIST_TIMEOUT,
            )
            .await?;
        parse_install(&output.stdout)
    }

    async fn update(&self) {
        match self
            .run(&["plugin", "update", PLUGIN_ID, "--yes"], UPDATE_TIMEOUT)
            .await
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                tracing::info!(output = %stdout.trim(), "herdr plugin update");
            }
            Err(error) => tracing::warn!(%error, "herdr plugin update failed"),
        }
    }

    async fn wait_until_idle(&self) -> bool {
        let idle = async {
            while (self.busy)() {
                tokio::time::sleep(IDLE_POLL).await;
            }
        };
        tokio::time::timeout(IDLE_WAIT, idle).await.is_ok()
    }

    fn restart(&self, version: &str) {
        let args: Vec<OsString> = [
            "plugin",
            "action",
            "invoke",
            START_ACTION,
            "--plugin",
            PLUGIN_ID,
        ]
        .map(OsString::from)
        .into();
        let command = detach::command(&self.herdr, &args, &std::env::temp_dir());
        match tokio::process::Command::from(command).spawn() {
            Ok(mut child) => {
                tracing::info!(%version, "asked herdr to start the updated bridge");
                tokio::spawn(async move { child.wait().await });
            }
            Err(error) => tracing::warn!(%error, "cannot ask herdr to start the updated bridge"),
        }
    }

    async fn run(&self, args: &[&str], timeout: Duration) -> Result<Output, HerdrError> {
        let mut command = background(&self.herdr);
        command.args(args);
        let output = tokio::time::timeout(timeout, command.output())
            .await
            .map_err(|_| HerdrError::TimedOut)??;
        if !output.status.success() {
            return Err(HerdrError::Failed {
                status: output.status,
                stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
            });
        }
        Ok(output)
    }
}

pub(super) fn herdr_bin() -> Option<PathBuf> {
    std::env::var_os("HERDR_BIN_PATH")
        .filter(|bin| !bin.is_empty())
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use tempfile::TempDir;

    #[cfg(windows)]
    const FAKE_HERDR: (&str, &str) = (
        "herdr.cmd",
        "@echo off\r\n\
         set DIR=%~dp0\r\n\
         if \"%1 %2\"==\"plugin list\" goto list\r\n\
         if \"%1 %2\"==\"plugin update\" goto update\r\n\
         if \"%1 %2\"==\"plugin action\" goto invoke\r\n\
         exit /b 2\r\n\
         :list\r\n\
         set /p V=<\"%DIR%version.txt\"\r\n\
         echo {\"id\":\"cli:plugin\",\"result\":{\"plugins\":[{\"plugin_id\":\"herdrop\",\"source\":{\"kind\":\"github\"},\"version\":\"%V%\"}],\"type\":\"plugin_list\"}}\r\n\
         exit /b 0\r\n\
         :update\r\n\
         copy /y \"%DIR%next.txt\" \"%DIR%version.txt\" >nul\r\n\
         echo updated herdrop\r\n\
         exit /b 0\r\n\
         :invoke\r\n\
         >>\"%DIR%invoked.txt\" echo %*\r\n\
         exit /b 0\r\n",
    );

    #[cfg(not(windows))]
    const FAKE_HERDR: (&str, &str) = (
        "herdr",
        "#!/bin/sh\n\
         dir=$(dirname \"$0\")\n\
         case \"$1 $2\" in\n\
         \"plugin list\") printf '{\"id\":\"cli:plugin\",\"result\":{\"plugins\":[{\"plugin_id\":\"herdrop\",\"source\":{\"kind\":\"github\"},\"version\":\"%s\"}],\"type\":\"plugin_list\"}}\\n' \"$(cat \"$dir/version.txt\")\" ;;\n\
         \"plugin update\") cp \"$dir/next.txt\" \"$dir/version.txt\"; echo updated herdrop ;;\n\
         \"plugin action\") echo \"$*\" >> \"$dir/invoked.txt\" ;;\n\
         *) exit 2 ;;\n\
         esac\n",
    );

    fn fake_herdr(dir: &Path) -> PathBuf {
        let (name, script) = FAKE_HERDR;
        let path = dir.join(name);
        std::fs::write(&path, script).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        path
    }

    async fn invoked(dir: &Path) -> Option<String> {
        let path = dir.join("invoked.txt");
        for _ in 0..100 {
            if let Ok(text) = std::fs::read_to_string(&path) {
                return Some(text.trim().to_owned());
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        None
    }

    #[tokio::test]
    async fn tick_restarts_only_when_the_update_changed_the_installed_version() {
        for (next, restarts) in [(VERSION, false), ("999.0.0", true)] {
            let tmp = TempDir::new().unwrap();
            std::fs::write(tmp.path().join("version.txt"), VERSION).unwrap();
            std::fs::write(tmp.path().join("next.txt"), next).unwrap();
            let updater = Updater {
                herdr: fake_herdr(tmp.path()),
                busy: || false,
            };

            updater.tick().await;

            let installed = std::fs::read_to_string(tmp.path().join("version.txt")).unwrap();
            assert_eq!(installed.trim(), next, "plugin update did not run");
            if restarts {
                assert_eq!(
                    invoked(tmp.path()).await.as_deref(),
                    Some(format!("plugin action invoke {START_ACTION} --plugin herdrop").as_str())
                );
            } else {
                assert!(!tmp.path().join("invoked.txt").exists(), "{next}");
            }
        }
    }

    const LINKED: &str = r#"{"id":"cli:plugin","result":{"plugins":[{"actions":[],"enabled":true,"plugin_id":"herdrop","plugin_root":"D:\\Projects\\herdrop\\apps\\bridge","source":{"kind":"local"},"version":"0.1.0"}],"type":"plugin_list"}}"#;

    fn github(version: &str) -> String {
        format!(
            r#"{{"id":"cli:plugin","result":{{"plugins":[{{"enabled":true,"plugin_id":"herdrop","source":{{"installed_unix_ms":1793111734534,"kind":"github","owner":"LuisBDev","repo":"herdrop","resolved_commit":"081ed133","subdir":"apps/bridge"}},"version":"{version}"}}],"type":"plugin_list"}}}}"#
        )
    }

    #[test]
    fn plugin_list_output_maps_to_the_install_kind() {
        assert_eq!(parse_install(LINKED.as_bytes()).unwrap(), Install::Other);
        assert_eq!(
            parse_install(github("0.2.0").as_bytes()).unwrap(),
            Install::GitHub {
                version: "0.2.0".into()
            }
        );
        let empty = r#"{"id":"cli:plugin","result":{"plugins":[],"type":"plugin_list"}}"#;
        assert!(matches!(
            parse_install(empty.as_bytes()),
            Err(HerdrError::NotInstalled)
        ));
        assert!(matches!(
            parse_install(b"error: no server"),
            Err(HerdrError::Parse(_))
        ));
    }

    #[test]
    fn only_a_github_install_of_another_version_needs_a_restart() {
        let rows = [
            (Install::Other, None),
            (
                Install::GitHub {
                    version: VERSION.into(),
                },
                None,
            ),
            (
                Install::GitHub {
                    version: "999.0.0".into(),
                },
                Some("999.0.0"),
            ),
        ];
        for (install, expected) in rows {
            assert_eq!(newer_install(&install), expected, "{install:?}");
        }
    }
}
