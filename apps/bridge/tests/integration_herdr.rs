use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Router;
use axum::body::Body;
use axum::http::header::{CONTENT_TYPE, HOST, ORIGIN};
use axum::http::{Method, Request, StatusCode};
use herdrop::adapters::fs_store::FsBundleStore;
use herdrop::adapters::herdr_cli::HerdrCli;
use herdrop::app::bridge::Bridge;
use herdrop::domain::bundle::Bundle;
use herdrop::domain::folder::EffectiveFolder;
use herdrop::domain::ids::{DropId, PaneId};
use herdrop::domain::prompt::prompt_line;
use herdrop::domain::retention::RetentionPolicy;
use herdrop::extension_id::parse_extension_id;
use herdrop::http::router;
use herdrop::http::security::SecurityConfig;
use herdrop::ports::{
    AgentDirectory, AgentPrompter, BundleLocation, BundleStore, Machine, PromptOutcome,
};
use herdrop::protocol::{
    BundleFile, CreateDropRequest, CreateDropResponse, DropState, DropStatus, FolderKind,
};
use http_body_util::BodyExt;
use jiff::Timestamp;
use serde_json::Value;
use tempfile::TempDir;
use tower::ServiceExt;

const SESSION: &str = "herdrop-test";
const AGENT_NAME: &str = "herdrop-it";
const PORT: u16 = 47821;
const HOST_HEADER: &str = "127.0.0.1:47821";
const ANSWER_TOKEN: &str = "HERDROP-IT-ANSWER";
const PROMPT_MARKER: &str = "Herdrop: read";
const SERVER_READY: Duration = Duration::from_secs(10);
const DROP_DEADLINE: Duration = Duration::from_secs(60);
const ANSWER_DEADLINE: Duration = Duration::from_secs(60);
const POLL: Duration = Duration::from_millis(500);
const HERDR_CONTEXT: [&str; 6] = [
    "HERDR_ENV",
    "HERDR_BIN_PATH",
    "HERDR_SOCKET_PATH",
    "HERDR_PANE_ID",
    "HERDR_WORKSPACE_ID",
    "HERDR_TAB_ID",
];

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

type RealBridge = Bridge<HerdrCli, FsBundleStore, HerdrCli>;

fn herdr(args: &[&str]) -> Command {
    let mut command = Command::new("herdr");
    command.arg("--session").arg(SESSION).args(args);
    command.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn herdr_unscoped(args: &[&str]) -> Command {
    let mut command = Command::new("herdr");
    command.args(args).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn run_text(args: &[&str]) -> String {
    let output = herdr(args).output().expect("run herdr");
    assert!(
        output.status.success(),
        "herdr {args:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn run_json(args: &[&str]) -> Value {
    let stdout = run_text(args);
    serde_json::from_str(&stdout).unwrap_or_else(|error| panic!("herdr {args:?}: {error}"))
}

fn strings_named(value: &Value, key: &str, found: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (name, child) in map {
                match child {
                    Value::String(text) if name == key => {
                        if !found.contains(text) {
                            found.push(text.clone());
                        }
                    }
                    _ => strings_named(child, key, found),
                }
            }
        }
        Value::Array(items) => items
            .iter()
            .for_each(|item| strings_named(item, key, found)),
        _ => {}
    }
}

fn only_string_named(value: &Value, key: &str) -> String {
    let mut found = Vec::new();
    strings_named(value, key, &mut found);
    assert_eq!(found.len(), 1, "expected one {key} in {value}");
    found.remove(0)
}

struct Session {
    server: Child,
}

impl Session {
    fn start() -> Self {
        let server = herdr(&["server"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn herdr server");
        let session = Self { server };
        let deadline = Instant::now() + SERVER_READY;
        loop {
            let ready = herdr(&["workspace", "list"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok_and(|status| status.success());
            if ready {
                return session;
            }
            assert!(
                Instant::now() < deadline,
                "herdr session {SESSION} not ready within 10 s"
            );
            std::thread::sleep(Duration::from_millis(200));
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        for args in [["session", "stop", SESSION], ["session", "delete", SESSION]] {
            match herdr_unscoped(&args).output() {
                Ok(output) if output.status.success() => {}
                Ok(output) => eprintln!(
                    "herdr {args:?} failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                ),
                Err(error) => eprintln!("herdr {args:?} failed: {error}"),
            }
        }
        if matches!(self.server.try_wait(), Ok(None)) {
            if let Err(error) = self.server.kill() {
                eprintln!("kill herdr server failed: {error}");
            }
            if let Err(error) = self.server.wait() {
                eprintln!("wait for herdr server failed: {error}");
            }
        }
    }
}

fn extension_id() -> String {
    parse_extension_id(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/protocol/fixtures/extension.json"
    )))
    .expect("valid extension.json")
}

fn same_dir(reported: &str, expected: &Path) -> bool {
    match (
        std::fs::canonicalize(reported),
        std::fs::canonicalize(expected),
    ) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

async fn send(app: &Router, method: Method, path: &str, body: Body) -> (StatusCode, Vec<u8>) {
    let request = Request::builder()
        .method(method)
        .uri(path)
        .header(HOST, HOST_HEADER)
        .header(ORIGIN, format!("chrome-extension://{}", extension_id()))
        .header(CONTENT_TYPE, "application/json")
        .body(body)
        .expect("request");
    let response = app.clone().oneshot(request).await.expect("router response");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("response body")
        .to_bytes();
    (status, bytes.to_vec())
}

fn bundle_files() -> Vec<BundleFile> {
    vec![
        BundleFile {
            name: "README.md".to_owned(),
            content: "# Herdrop drop\n\nOne annotation: A1.md (question).\n".to_owned(),
        },
        BundleFile {
            name: "A1.md".to_owned(),
            content: format!(
                "# A1 question\n\nWhat does this folder contain?\n\nStart your answer with {ANSWER_TOKEN}.\n"
            ),
        },
    ]
}

async fn create_drop(app: &Router, pane: &str) -> String {
    let request = CreateDropRequest {
        client_request_id: format!("it-{}", fastrand::u64(..)),
        machine: "local".to_owned(),
        pane_id: pane.to_owned(),
        files: bundle_files(),
    };
    let body = serde_json::to_string(&request).expect("serialize request");
    let (status, bytes) = send(app, Method::POST, "/drops", Body::from(body)).await;
    assert_eq!(
        status,
        StatusCode::ACCEPTED,
        "{}",
        String::from_utf8_lossy(&bytes)
    );
    let created: CreateDropResponse = serde_json::from_slice(&bytes).expect("create response");
    created.drop_id
}

async fn wait_final(app: &Router, id: &str) -> DropStatus {
    let deadline = Instant::now() + DROP_DEADLINE;
    loop {
        let (status, bytes) = send(app, Method::GET, &format!("/drops/{id}"), Body::empty()).await;
        assert_eq!(
            status,
            StatusCode::OK,
            "{}",
            String::from_utf8_lossy(&bytes)
        );
        let drop: DropStatus = serde_json::from_slice(&bytes).expect("drop status");
        if drop.state != DropState::Running {
            return drop;
        }
        assert!(
            Instant::now() < deadline,
            "drop {id} still running after 60 s"
        );
        tokio::time::sleep(POLL).await;
    }
}

fn agent_output(pane: &str) -> String {
    run_text(&["agent", "read", pane, "--source", "recent-unwrapped"])
}

async fn wait_for_answer(pane: &str) {
    let deadline = Instant::now() + ANSWER_DEADLINE;
    loop {
        let output = agent_output(pane);
        let answered = output
            .find(PROMPT_MARKER)
            .is_some_and(|start| output[start..].contains(ANSWER_TOKEN));
        if answered {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "agent wrote no answer after the prompt line within 60 s:\n{output}"
        );
        tokio::time::sleep(POLL).await;
    }
}

fn readme_path(folder: &Path, id: &str) -> PathBuf {
    folder
        .join(".herdrop")
        .join("drop")
        .join(id)
        .join("README.md")
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "opt-in: needs real herdr"]
async fn real_herdr_round_trip() {
    if std::env::var("HERDROP_IT").as_deref() != Ok("1") {
        eprintln!("skipped: set HERDROP_IT=1");
        return;
    }
    let inherited: Vec<&str> = HERDR_CONTEXT
        .into_iter()
        .filter(|name| std::env::var_os(name).is_some())
        .collect();
    assert!(
        inherited.is_empty(),
        "unset {inherited:?} before running: inside a Herdr pane they can route commands to the live server instead of {SESSION}"
    );

    let folder = TempDir::new().expect("temp dir A");
    let home = TempDir::new().expect("temp dir H");
    let _session = Session::start();

    let folder_arg = folder.path().to_str().expect("utf-8 temp dir");
    let created = run_json(&["workspace", "create", "--cwd", folder_arg, "--no-focus"]);
    let workspace = only_string_named(&created["result"]["workspace"], "workspace_id");
    let panes = run_json(&["pane", "list", "--workspace", &workspace]);
    let pane = only_string_named(&panes["result"], "pane_id");
    run_text(&[
        "agent", "start", AGENT_NAME, "--kind", "claude", "--pane", &pane,
    ]);

    let cli = HerdrCli::from_env().with_session(SESSION);
    let agents = cli.agents(&Machine::Local).await.expect("agent list");
    let record = agents
        .iter()
        .find(|agent| agent.pane_id.as_str() == pane)
        .unwrap_or_else(|| panic!("pane {pane} missing from {agents:?}"));
    assert_eq!(record.folder_kind, FolderKind::Cwd);
    let reported = match &record.folder {
        EffectiveFolder::Path(path) => path.clone(),
        EffectiveFolder::Home => panic!("agent folder resolved to home"),
    };
    assert!(
        same_dir(&reported, folder.path()),
        "agent folder {reported} is not {}",
        folder.path().display()
    );

    let directory = Arc::new(cli.clone());
    let store = Arc::new(FsBundleStore {
        home: home.path().to_path_buf(),
    });
    let bridge: Arc<RealBridge> = Arc::new(Bridge::new(
        directory,
        Arc::clone(&store),
        Arc::new(cli.clone()),
        RetentionPolicy::from_days(7),
        Arc::new(Timestamp::now),
    ));
    let app = router(bridge, SecurityConfig::new(PORT, &extension_id()));

    let first = create_drop(&app, &pane).await;
    let first_status = wait_final(&app, &first).await;
    assert_eq!(first_status.state, DropState::Delivered, "{first_status:?}");
    assert!(readme_path(folder.path(), &first).exists());

    let second = create_drop(&app, &pane).await;
    let second_status = wait_final(&app, &second).await;
    assert_eq!(
        second_status.state,
        DropState::Delivered,
        "{second_status:?}"
    );

    wait_for_answer(&pane).await;

    let location = BundleLocation {
        machine: Machine::Local,
        folder: EffectiveFolder::Home,
    };
    let id = DropId::generate(Timestamp::now(), &mut fastrand::Rng::new());
    let bundle = Bundle::new(
        bundle_files()
            .into_iter()
            .map(|file| (file.name.parse().expect("bundle name"), file.content))
            .collect(),
    )
    .expect("bundle");
    let written = store
        .write(
            &location,
            &id,
            &bundle,
            Timestamp::now(),
            &RetentionPolicy::from_days(7),
        )
        .await
        .expect("home bundle");
    let pane_id: PaneId = pane.parse().expect("pane id");
    let outcome = cli
        .prompt(&Machine::Local, &pane_id, &prompt_line(&written.readme))
        .await
        .expect("home prompt");
    assert_eq!(outcome, PromptOutcome::Delivered);
    println!("home fallback agent output:\n{}", agent_output(&pane));
}
