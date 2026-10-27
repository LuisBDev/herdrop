use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::Output;
use std::time::Duration;

use crate::adapters::herdr_json::{parse_agent_list, parse_error, parse_machine_list};
use crate::domain::ids::PaneId;
use crate::ports::{
    AgentDirectory, AgentPrompter, AgentRecord, DirectoryError, Machine, MachineProfile,
    PromptError, PromptOutcome,
};
use crate::process::background;

const BIN_ENV: &str = "HERDR_BIN_PATH";
const DEFAULT_BIN: &str = "herdr";
const RUN_TIMEOUT: Duration = Duration::from_secs(60);
const PROMPT_TIMEOUT_MS: &str = "45000";
const TIMED_OUT: &str = "herdr timed out";
const USAGE_EXIT: i32 = 2;
const FAILURE_EXIT: i32 = 1;

#[derive(Debug, Clone)]
pub struct HerdrCli {
    pub bin: PathBuf,
    pub session: Option<String>,
}

#[derive(Debug)]
enum RunError {
    Missing,
    TimedOut,
    Io(std::io::Error),
}

impl HerdrCli {
    pub fn from_env() -> Self {
        let bin = std::env::var_os(BIN_ENV)
            .filter(|value| !value.is_empty())
            .map_or_else(|| PathBuf::from(DEFAULT_BIN), PathBuf::from);
        Self { bin, session: None }
    }

    pub fn with_session(mut self, name: impl Into<String>) -> Self {
        self.session = Some(name.into());
        self
    }

    async fn run(&self, args: Vec<String>) -> Result<Output, RunError> {
        let mut command = background(&self.bin);
        if let Some(session) = &self.session {
            command.arg("--session").arg(session);
        }
        command.args(args);
        match tokio::time::timeout(RUN_TIMEOUT, command.output()).await {
            Err(_) => Err(RunError::TimedOut),
            Ok(Err(error)) if error.kind() == ErrorKind::NotFound => Err(RunError::Missing),
            Ok(Err(error)) => Err(RunError::Io(error)),
            Ok(Ok(output)) => Ok(output),
        }
    }
}

pub(crate) fn machine_list_args() -> Vec<String> {
    strings(&["machine", "list", "--json"])
}

pub(crate) fn agent_list_args(machine: &Machine) -> Vec<String> {
    let mut args = machine_args(machine);
    args.extend(strings(&["agent", "list"]));
    args
}

pub(crate) fn prompt_args(machine: &Machine, pane: &PaneId, line: &str) -> Vec<String> {
    let mut args = machine_args(machine);
    args.extend(strings(&["agent", "prompt", pane.as_str(), line]));
    args.extend(strings(&[
        "--wait",
        "--until",
        "working",
        "--until",
        "blocked",
        "--timeout",
        PROMPT_TIMEOUT_MS,
    ]));
    args
}

fn machine_args(machine: &Machine) -> Vec<String> {
    match machine {
        Machine::Local => Vec::new(),
        Machine::Remote(profile) => vec!["--machine".to_owned(), profile.key.to_string()],
    }
}

fn strings(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| (*item).to_owned()).collect()
}

fn stderr_text(stderr: &str, exit_code: Option<i32>) -> String {
    let text = stderr.trim();
    if text.is_empty() {
        match exit_code {
            Some(code) => format!("herdr exited with status {code}"),
            None => "herdr was terminated".to_owned(),
        }
    } else {
        text.to_owned()
    }
}

pub(crate) fn directory_error(
    exit_code: Option<i32>,
    stderr: &str,
    machine: &Machine,
) -> DirectoryError {
    match (exit_code, machine) {
        (Some(USAGE_EXIT), Machine::Remote(profile))
            if stderr.contains("unknown machine") || stderr.contains("is disabled") =>
        {
            DirectoryError::UnknownMachine(profile.key.to_string())
        }
        (Some(FAILURE_EXIT), _) => match parse_error(stderr) {
            Some((code, message)) => DirectoryError::Command(format!("{code}: {message}")),
            None => DirectoryError::Command(stderr_text(stderr, exit_code)),
        },
        _ => DirectoryError::Command(stderr_text(stderr, exit_code)),
    }
}

pub(crate) fn prompt_outcome(
    exit_code: Option<i32>,
    stderr: &str,
) -> Result<PromptOutcome, PromptError> {
    if exit_code == Some(0) {
        return Ok(PromptOutcome::Delivered);
    }
    let Some((code, message)) = parse_error(stderr) else {
        return Err(PromptError::Command(stderr_text(stderr, exit_code)));
    };
    match code.as_str() {
        "agent_prompt_stalled" | "timeout" => Ok(PromptOutcome::NoActivity),
        "agent_blocked" => Ok(PromptOutcome::AgentBlocked),
        "agent_not_found" | "agent_not_running" => Ok(PromptOutcome::AgentGone),
        _ => Err(PromptError::Command(format!("{code}: {message}"))),
    }
}

fn run_directory_error(error: RunError) -> DirectoryError {
    match error {
        RunError::Missing => DirectoryError::HerdrMissing,
        RunError::TimedOut => DirectoryError::Command(TIMED_OUT.to_owned()),
        RunError::Io(error) => DirectoryError::Command(format!("failed to run herdr: {error}")),
    }
}

fn run_prompt_error(error: RunError) -> PromptError {
    match error {
        RunError::Missing => PromptError::HerdrMissing,
        RunError::TimedOut => PromptError::Command(TIMED_OUT.to_owned()),
        RunError::Io(error) => PromptError::Command(format!("failed to run herdr: {error}")),
    }
}

fn checked_stdout(output: &Output, machine: &Machine) -> Result<String, DirectoryError> {
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(directory_error(
            output.status.code(),
            &String::from_utf8_lossy(&output.stderr),
            machine,
        ))
    }
}

impl AgentDirectory for HerdrCli {
    async fn machines(&self) -> Result<Vec<MachineProfile>, DirectoryError> {
        let output = self
            .run(machine_list_args())
            .await
            .map_err(run_directory_error)?;
        parse_machine_list(&checked_stdout(&output, &Machine::Local)?)
    }

    async fn agents(&self, machine: &Machine) -> Result<Vec<AgentRecord>, DirectoryError> {
        let output = self
            .run(agent_list_args(machine))
            .await
            .map_err(run_directory_error)?;
        parse_agent_list(&checked_stdout(&output, machine)?)
    }
}

impl AgentPrompter for HerdrCli {
    async fn prompt(
        &self,
        machine: &Machine,
        pane: &PaneId,
        line: &str,
    ) -> Result<PromptOutcome, PromptError> {
        let output = self
            .run(prompt_args(machine, pane, line))
            .await
            .map_err(run_prompt_error)?;
        let outcome = prompt_outcome(
            output.status.code(),
            &String::from_utf8_lossy(&output.stderr),
        );
        tracing::debug!(machine = %machine.key(), pane = %pane, ?outcome, "herdr prompt finished");
        outcome
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ports::MachineProfile;

    fn envelope(code: &str, message: &str) -> String {
        format!(r#"{{"error":{{"code":"{code}","message":"{message}"}},"id":"cli:agent:prompt"}}"#)
    }

    #[test]
    fn prompt_outcome_table() {
        let ok = |outcome| Ok::<PromptOutcome, String>(outcome);
        let rows = [
            (Some(0), String::new(), ok(PromptOutcome::Delivered)),
            (
                Some(1),
                envelope("agent_prompt_stalled", "no activity"),
                ok(PromptOutcome::NoActivity),
            ),
            (
                Some(1),
                envelope("timeout", "timed out"),
                ok(PromptOutcome::NoActivity),
            ),
            (
                Some(1),
                envelope("agent_blocked", "agent is blocked"),
                ok(PromptOutcome::AgentBlocked),
            ),
            (
                Some(1),
                r#"{"error":{"code":"agent_not_found","message":"agent target w99:p99 not found"},"id":"cli:agent:get"}"#.to_owned(),
                ok(PromptOutcome::AgentGone),
            ),
            (
                Some(1),
                r#"{"error":{"code":"agent_not_running","message":"agent is no longer running in the target pane"},"id":"cli:agent:prompt"}"#.to_owned(),
                ok(PromptOutcome::AgentGone),
            ),
            (
                Some(1),
                envelope("pane_not_found", "pane w1:p1 not found"),
                Err("pane_not_found: pane w1:p1 not found".to_owned()),
            ),
            (Some(1), "boom\n".to_owned(), Err("boom".to_owned())),
        ];
        for (exit, stderr, expected) in rows {
            let actual = prompt_outcome(exit, &stderr).map_err(|error| match error {
                PromptError::Command(message) => message,
                PromptError::HerdrMissing => "herdr missing".to_owned(),
            });
            assert_eq!(actual, expected, "{stderr}");
        }
    }

    #[test]
    fn machine_selector_errors_map_to_unknown_machine() {
        let key = "779f8353534145c8951edca5f0dd34cd";
        let machine = Machine::Remote(MachineProfile {
            key: key.parse().unwrap(),
            label: "Build machine".to_owned(),
            ssh_target: "vps".to_owned(),
        });
        let unknown = format!("error: unknown machine '{key}'; use `herdr machine list`\n");
        let disabled = format!("error: machine '{key}' is disabled\n");
        for stderr in [unknown, disabled] {
            assert!(
                matches!(
                    directory_error(Some(2), &stderr, &machine),
                    DirectoryError::UnknownMachine(ref k) if k == key
                ),
                "{stderr}"
            );
        }
        assert!(matches!(
            directory_error(Some(2), "error: unexpected argument '--bogus'\n", &machine),
            DirectoryError::Command(ref text) if text == "error: unexpected argument '--bogus'"
        ));
    }
}
