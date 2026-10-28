use std::io::Write;
use std::path::Path;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tempfile::TempDir;

const REMOTE: &str = "779f8353534145c8951edca5f0dd34cd";

type Row = (
    Option<std::path::PathBuf>,
    Vec<&'static str>,
    i32,
    Option<Value>,
    bool,
);

fn local_agent() -> Value {
    json!({ "pane_id": "w1:p1", "agent": "claude" })
}

fn remote_agent() -> Value {
    json!({ "pane_id": "w2:p1", "agent": "codex" })
}

fn scenario(outcome: &str, delay_ms: u64) -> Value {
    json!({
        "machines": [{
            "id": REMOTE,
            "label": "My VPS",
            "target": "vps",
            "session": "default",
            "enabled": true,
            "selected": false
        }],
        "agents": { "local": [local_agent()], REMOTE: [remote_agent()] },
        "prompt": { "outcome": outcome, "delay_ms": delay_ms }
    })
}

fn write_scenario(dir: &Path, value: &Value) -> std::path::PathBuf {
    let path = dir.join("scenario.json");
    std::fs::write(&path, value.to_string()).unwrap();
    path
}

fn run_herdr(scenario_path: Option<&Path>, log: Option<&Path>, argv: &[&str]) -> Output {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_herdr"));
    cmd.args(argv)
        .env_remove("FAKE_HERDR_SCENARIO")
        .env_remove("FAKE_HERDR_LOG");
    if let Some(path) = scenario_path {
        cmd.env("FAKE_HERDR_SCENARIO", path);
    }
    if let Some(path) = log {
        cmd.env("FAKE_HERDR_LOG", path);
    }
    cmd.output().unwrap()
}

fn json_of(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap()
}

fn prompt_error(code: &str, message: &str) -> Value {
    json!({ "error": { "code": code, "message": message }, "id": "cli:agent:prompt" })
}

#[test]
fn herdr_commands_match_herdr_output() {
    let dir = TempDir::new().unwrap();
    let ok = write_scenario(dir.path(), &scenario("ok", 0));
    let prompt_ok = json!({
        "id": "cli:agent:prompt",
        "result": { "agent": local_agent(), "type": "agent_prompted" }
    });
    let not_found = prompt_error("agent_not_found", "agent target w9:p9 not found");

    let mut rows: Vec<Row> = vec![
        (
            Some(ok.clone()),
            vec!["agent", "list"],
            0,
            Some(json!({
                "id": "cli:agent:list",
                "result": { "agents": [local_agent()], "type": "agent_list" }
            })),
            false,
        ),
        (
            Some(ok.clone()),
            vec!["--machine", REMOTE, "agent", "list"],
            0,
            Some(json!({
                "id": "cli:agent:list",
                "result": { "agents": [remote_agent()], "type": "agent_list" }
            })),
            false,
        ),
        (
            Some(ok.clone()),
            vec!["--machine", "nope", "agent", "list"],
            2,
            None,
            true,
        ),
        (
            None,
            vec!["machine", "list", "--json"],
            0,
            Some(json!([])),
            false,
        ),
        (
            Some(ok.clone()),
            vec!["agent", "prompt", "w1:p1", "x"],
            0,
            Some(prompt_ok),
            false,
        ),
        (
            Some(ok.clone()),
            vec!["agent", "prompt", "w9:p9", "x"],
            1,
            Some(not_found),
            true,
        ),
    ];
    for (outcome, code) in [
        ("agent_prompt_stalled", "agent_prompt_stalled"),
        ("timeout", "timeout"),
        ("agent_blocked", "agent_blocked"),
        ("agent_not_found", "agent_not_found"),
        ("agent_not_running", "agent_not_running"),
        ("error", "internal_error"),
    ] {
        let path = dir.path().join(format!("{outcome}.json"));
        std::fs::write(&path, scenario(outcome, 0).to_string()).unwrap();
        rows.push((
            Some(path),
            vec!["agent", "prompt", "w1:p1", "x", "--wait"],
            1,
            Some(prompt_error(code, "fake")),
            true,
        ));
    }

    for (path, argv, exit, expected, on_stderr) in rows {
        let output = run_herdr(path.as_deref(), None, &argv);
        assert_eq!(output.status.code(), Some(exit), "{argv:?}");
        match expected {
            Some(expected) => {
                let bytes = if on_stderr {
                    &output.stderr
                } else {
                    &output.stdout
                };
                assert_eq!(json_of(bytes), expected, "{argv:?}");
            }
            None => assert!(
                String::from_utf8_lossy(&output.stderr)
                    .contains("error: unknown machine 'nope'; use `herdr machine list`"),
                "{argv:?}"
            ),
        }
    }
}

#[test]
fn prompt_waits_delay_ms() {
    let dir = TempDir::new().unwrap();
    let path = write_scenario(dir.path(), &scenario("ok", 300));
    let started = Instant::now();
    let output = run_herdr(Some(&path), None, &["agent", "prompt", "w1:p1", "x"]);
    assert_eq!(output.status.code(), Some(0));
    assert!(started.elapsed() >= Duration::from_millis(300));
}

#[test]
fn log_records_argv_for_every_call() {
    let dir = TempDir::new().unwrap();
    let path = write_scenario(dir.path(), &scenario("ok", 0));
    let log = dir.path().join("calls.log");
    run_herdr(Some(&path), Some(&log), &["agent", "list"]);
    let second = run_herdr(Some(&path), Some(&log), &["bogus", "--flag"]);
    assert_eq!(second.status.code(), Some(2));
    let lines: Vec<Value> = std::fs::read_to_string(&log)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(
        lines,
        vec![
            json!({ "bin": "herdr", "argv": ["agent", "list"] }),
            json!({ "bin": "herdr", "argv": ["bogus", "--flag"] }),
        ]
    );
}

#[test]
fn ssh_logs_argv_drains_stdin_and_exits_255() {
    let dir = TempDir::new().unwrap();
    let log = dir.path().join("calls.log");
    let mut child = Command::new(env!("CARGO_BIN_EXE_ssh"))
        .args(["-T", "vps", "sh -c 'true'"])
        .env("FAKE_HERDR_LOG", &log)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    stdin.write_all(&vec![7u8; 1024 * 1024]).unwrap();
    drop(stdin);
    let output = child.wait_with_output().unwrap();
    assert_eq!(output.status.code(), Some(255));
    assert_eq!(
        String::from_utf8_lossy(&output.stderr).trim(),
        "fake ssh: no remote hosts in tests"
    );
    let line: Value = serde_json::from_str(std::fs::read_to_string(&log).unwrap().trim()).unwrap();
    assert_eq!(
        line,
        json!({ "bin": "ssh", "argv": ["-T", "vps", "sh -c 'true'"] })
    );
}
