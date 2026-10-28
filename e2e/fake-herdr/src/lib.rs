use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SCENARIO_VAR: &str = "FAKE_HERDR_SCENARIO";
pub const LOG_VAR: &str = "FAKE_HERDR_LOG";

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Scenario {
    pub machines: Vec<Value>,
    pub agents: HashMap<String, Vec<Value>>,
    pub prompt: Prompt,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Prompt {
    pub outcome: Outcome,
    pub delay_ms: u64,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    #[default]
    Ok,
    AgentPromptStalled,
    Timeout,
    AgentBlocked,
    AgentNotFound,
    AgentNotRunning,
    Error,
}

impl Outcome {
    pub fn error_code(self) -> &'static str {
        match self {
            Outcome::Ok => "ok",
            Outcome::AgentPromptStalled => "agent_prompt_stalled",
            Outcome::Timeout => "timeout",
            Outcome::AgentBlocked => "agent_blocked",
            Outcome::AgentNotFound => "agent_not_found",
            Outcome::AgentNotRunning => "agent_not_running",
            Outcome::Error => "internal_error",
        }
    }
}

pub fn load_scenario() -> Result<Scenario, String> {
    let Some(path) = std::env::var_os(SCENARIO_VAR) else {
        return Ok(Scenario::default());
    };
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Scenario::default());
        }
        Err(err) => return Err(format!("cannot read scenario: {err}")),
    };
    serde_json::from_str(&text).map_err(|err| format!("invalid scenario: {err}"))
}

#[derive(Serialize)]
struct LogLine<'a> {
    bin: &'a str,
    argv: &'a [String],
}

pub fn append_log(bin: &str, argv: &[String]) {
    let Some(path) = std::env::var_os(LOG_VAR) else {
        return;
    };
    let Ok(mut line) = serde_json::to_vec(&LogLine { bin, argv }) else {
        return;
    };
    line.push(b'\n');
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(&line);
    }
}
