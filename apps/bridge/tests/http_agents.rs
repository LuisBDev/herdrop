mod support;

use std::time::Duration;

use axum::Router;
use axum::http::StatusCode;
use herdrop::domain::folder::EffectiveFolder;
use herdrop::ports::{AgentRecord, MachineProfile};
use herdrop::protocol::{AgentStatus, FolderKind};
use jiff::SignedDuration;
use serde_json::{Value, json};
use support::{FakeError, get, test_bridge};

const REMOTE_KEY: &str = "779f8353534145c8951edca5f0dd34cd";
const LOCAL_AGENTS: &str = "/agents?machine=local";

fn profile() -> MachineProfile {
    MachineProfile {
        key: REMOTE_KEY.parse().unwrap(),
        label: "Build machine".to_owned(),
        ssh_target: "build".to_owned(),
    }
}

fn agent(pane: &str, focused: bool) -> AgentRecord {
    AgentRecord {
        pane_id: pane.parse().unwrap(),
        name: format!("agent {pane}"),
        kind: Some("claude".to_owned()),
        status: AgentStatus::Idle,
        focused,
        folder: EffectiveFolder::Path(format!("/work/{pane}")),
        folder_kind: FolderKind::Cwd,
    }
}

fn pane_ids(body: &Value) -> Vec<String> {
    body["agents"]
        .as_array()
        .unwrap()
        .iter()
        .map(|agent| agent["pane_id"].as_str().unwrap().to_owned())
        .collect()
}

async fn settle(app: &Router, path: &str) -> Value {
    for _ in 0..100 {
        let (status, _, body) = get(app, path).await;
        assert_eq!(status, StatusCode::OK);
        if body["refreshing"] == false {
            return body;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("{path} still refreshing after 1 s");
}

#[tokio::test]
async fn machines_lists_local_first_and_reports_directory_errors() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, handles) = test_bridge(tmp.path());
    handles.directory.set_machines(Ok(vec![profile()]));

    let (status, _, body) = get(&app, "/machines").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "machines": [
                {"key": "local", "label": "local", "local": true},
                {"key": REMOTE_KEY, "label": "Build machine", "local": false}
            ],
            "error": null
        })
    );

    handles.directory.set_machines(Err(FakeError::HerdrMissing));

    let (status, _, body) = get(&app, "/machines").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "machines": [{"key": "local", "label": "local", "local": true}],
            "error": "herdr not found"
        })
    );
}

#[tokio::test]
async fn concurrent_first_local_requests_run_one_agent_list() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, handles) = test_bridge(tmp.path());
    handles
        .directory
        .set_delay(Some(Duration::from_millis(100)));
    handles
        .directory
        .set_agents("local", Ok(vec![agent("p1", false), agent("p2", true)]));

    let (first, second) = tokio::join!(get(&app, LOCAL_AGENTS), get(&app, LOCAL_AGENTS));

    for (status, _, body) in [first, second] {
        assert_eq!(status, StatusCode::OK);
        assert_eq!(pane_ids(&body), ["p2", "p1"]);
        assert_eq!(body["refreshing"], false);
    }
    assert_eq!(handles.directory.agent_calls("local"), 1);
}

#[tokio::test]
async fn remote_first_request_returns_refreshing_then_settles() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, handles) = test_bridge(tmp.path());
    handles.directory.set_machines(Ok(vec![profile()]));
    handles
        .directory
        .set_agents(REMOTE_KEY, Ok(vec![agent("r1", false)]));
    let path = format!("/agents?machine={REMOTE_KEY}");

    let (status, _, first) = get(&app, &path).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["machine"], REMOTE_KEY);
    assert_eq!(first["refreshing"], true);
    assert_eq!(first["agents"], json!([]));

    let settled = settle(&app, &path).await;

    assert_eq!(pane_ids(&settled), ["r1"]);
    assert!(settled["refreshed_at"].is_string());

    let (_, _, again) = get(&app, &path).await;

    assert_eq!(again["refreshing"], false);
    assert_eq!(handles.directory.agent_calls(REMOTE_KEY), 1);
}

#[tokio::test]
async fn fresh_window_force_flag_and_failed_refresh() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, handles) = test_bridge(tmp.path());
    handles.directory.set_machines(Ok(vec![profile()]));
    handles
        .directory
        .set_agents("local", Ok(vec![agent("p1", true)]));
    handles
        .directory
        .set_agents(REMOTE_KEY, Ok(vec![agent("r1", false)]));
    let remote = format!("/agents?machine={REMOTE_KEY}");
    let forced = format!("{LOCAL_AGENTS}&refresh=true");
    let calls = || handles.directory.agent_calls("local");
    let remote_calls = || handles.directory.agent_calls(REMOTE_KEY);
    get(&app, LOCAL_AGENTS).await;
    settle(&app, &remote).await;
    assert_eq!((calls(), remote_calls()), (1, 1));

    handles.clock.advance(SignedDuration::from_millis(999));
    let (_, _, inside) = get(&app, LOCAL_AGENTS).await;

    assert_eq!(inside["refreshing"], false);
    assert_eq!(calls(), 1);

    handles.clock.advance(SignedDuration::from_millis(1));
    let (_, _, stale) = get(&app, LOCAL_AGENTS).await;
    let (_, _, remote_inside) = get(&app, &remote).await;

    assert_eq!(stale["refreshing"], true);
    assert_eq!(remote_inside["refreshing"], false);
    settle(&app, LOCAL_AGENTS).await;
    assert_eq!((calls(), remote_calls()), (2, 1));

    handles.clock.advance(SignedDuration::from_secs(9));
    let (_, _, remote_stale) = get(&app, &remote).await;

    assert_eq!(remote_stale["refreshing"], true);
    settle(&app, &remote).await;
    assert_eq!(remote_calls(), 2);

    let (_, _, force) = get(&app, &forced).await;

    assert_eq!(force["refreshing"], true);
    settle(&app, LOCAL_AGENTS).await;
    assert_eq!(calls(), 3);

    handles
        .directory
        .set_agents("local", Err(FakeError::Command("herdr crashed".to_owned())));
    get(&app, &forced).await;
    let failed = settle(&app, LOCAL_AGENTS).await;

    assert_eq!(calls(), 4);
    assert_eq!(pane_ids(&failed), ["p1"]);
    assert_eq!(failed["error"], "herdr crashed");
}
