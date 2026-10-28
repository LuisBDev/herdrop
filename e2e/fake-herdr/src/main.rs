use std::process::ExitCode;
use std::time::Duration;

use fake_herdr::{Outcome, Scenario, append_log, load_scenario};
use serde_json::{Value, json};

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    append_log("herdr", &argv);
    let scenario = match load_scenario() {
        Ok(scenario) => scenario,
        Err(message) => return fail(&message, 2),
    };
    run(&scenario, &argv)
}

fn fail(message: &str, code: u8) -> ExitCode {
    eprintln!("{message}");
    ExitCode::from(code)
}

fn run(scenario: &Scenario, argv: &[String]) -> ExitCode {
    let (key, rest) = match argv {
        [flag, key, rest @ ..] if flag == "--machine" => (key.as_str(), rest),
        _ => ("local", argv),
    };
    let known = key == "local"
        || scenario
            .machines
            .iter()
            .any(|machine| machine["id"].as_str() == Some(key));
    if !known {
        return fail(
            &format!("error: unknown machine '{key}'; use `herdr machine list`"),
            2,
        );
    }
    let rest: Vec<&str> = rest.iter().map(String::as_str).collect();
    match rest.as_slice() {
        ["machine", "list", "--json"] => print_json(&Value::Array(scenario.machines.clone())),
        ["agent", "list"] => {
            let agents = scenario.agents.get(key).cloned().unwrap_or_default();
            print_json(&json!({
                "id": "cli:agent:list",
                "result": { "agents": agents, "type": "agent_list" }
            }))
        }
        ["agent", "prompt", pane, _text, ..] => prompt(scenario, key, pane),
        ["notification", "show", ..] => ExitCode::SUCCESS,
        _ => fail("error: unsupported command", 2),
    }
}

fn prompt(scenario: &Scenario, key: &str, pane: &str) -> ExitCode {
    std::thread::sleep(Duration::from_millis(scenario.prompt.delay_ms));
    let agent = scenario
        .agents
        .get(key)
        .and_then(|agents| agents.iter().find(|agent| agent["pane_id"] == *pane));
    let Some(agent) = agent else {
        return prompt_error("agent_not_found", &format!("agent target {pane} not found"));
    };
    match scenario.prompt.outcome {
        Outcome::Ok => print_json(&json!({
            "id": "cli:agent:prompt",
            "result": { "agent": agent, "type": "agent_prompted" }
        })),
        other => prompt_error(other.error_code(), "fake"),
    }
}

fn prompt_error(code: &str, message: &str) -> ExitCode {
    eprintln!(
        "{}",
        json!({ "error": { "code": code, "message": message }, "id": "cli:agent:prompt" })
    );
    ExitCode::from(1)
}

fn print_json(value: &Value) -> ExitCode {
    println!("{value}");
    ExitCode::SUCCESS
}
