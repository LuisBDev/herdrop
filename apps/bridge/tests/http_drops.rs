mod support;

use std::path::{Path, PathBuf};
use std::time::Duration;

use axum::Router;
use axum::http::StatusCode;
use herdrop::domain::folder::EffectiveFolder;
use herdrop::domain::ids::DropId;
use herdrop::ports::{AgentRecord, PromptOutcome};
use herdrop::protocol::{AgentStatus, FolderKind};
use serde_json::{Value, json};
use support::{Handles, get, post_json, test_bridge};

const PANE: &str = "w1-p1";
const REQUEST_ID: &str = "0b9e6c1e-5d5a-4f62-9a57-1c1f3f7e2a10";
const UNKNOWN_DROP: &str = "20261027-153012-zzzz";

fn agent(pane: &str, status: AgentStatus, folder: &Path) -> AgentRecord {
    AgentRecord {
        pane_id: pane.parse().unwrap(),
        name: "claude".to_owned(),
        kind: Some("claude".to_owned()),
        status,
        focused: true,
        folder: EffectiveFolder::Path(folder.display().to_string()),
        folder_kind: FolderKind::Cwd,
    }
}

fn files(annotations: usize) -> Vec<Value> {
    std::iter::once(json!({"name": "README.md", "content": "# Drop\n"}))
        .chain(
            (1..=annotations)
                .map(|n| json!({"name": format!("A{n}.md"), "content": format!("note {n}\n")})),
        )
        .collect()
}

fn create_body(request_id: &str, files: Vec<Value>) -> Value {
    json!({
        "client_request_id": request_id,
        "machine": "local",
        "pane_id": PANE,
        "files": files,
    })
}

fn fresh_id() -> String {
    format!("req-{}", fastrand::u64(..))
}

async fn create(app: &Router, files: Vec<Value>) -> String {
    let (status, _, body) = post_json(app, "/drops", &create_body(&fresh_id(), files)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    body["drop_id"].as_str().unwrap().to_owned()
}

async fn wait_final(app: &Router, id: &str) -> Value {
    for _ in 0..100 {
        let (status, _, body) = get(app, &format!("/drops/{id}")).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        if body["state"] != "running" {
            return body;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("drop {id} still running after 2 s");
}

fn drop_dir(folder: &Path) -> PathBuf {
    folder.join(".herdrop").join("drop")
}

fn entries(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    names
}

fn local_agent(handles: &Handles, status: AgentStatus, pane: &str, folder: &Path) {
    handles
        .directory
        .set_agents("local", Ok(vec![agent(pane, status, folder)]));
}

type OutcomeRow = (
    &'static str,
    AgentStatus,
    Result<PromptOutcome, &'static str>,
    &'static str,
    &'static str,
    bool,
    usize,
);

#[tokio::test]
async fn workflow_outcome_table() {
    let rows: [OutcomeRow; 7] = [
        (
            PANE,
            AgentStatus::Idle,
            Ok(PromptOutcome::Delivered),
            "delivered",
            "wait_activity",
            true,
            1,
        ),
        (
            "w9-p9",
            AgentStatus::Idle,
            Ok(PromptOutcome::Delivered),
            "agent_gone",
            "check_agent",
            false,
            0,
        ),
        (
            PANE,
            AgentStatus::Blocked,
            Ok(PromptOutcome::Delivered),
            "agent_blocked",
            "check_agent",
            false,
            0,
        ),
        (
            PANE,
            AgentStatus::Working,
            Ok(PromptOutcome::AgentBlocked),
            "agent_blocked",
            "prompt_agent",
            true,
            1,
        ),
        (
            PANE,
            AgentStatus::Idle,
            Ok(PromptOutcome::AgentGone),
            "agent_gone",
            "prompt_agent",
            true,
            1,
        ),
        (
            PANE,
            AgentStatus::Idle,
            Ok(PromptOutcome::NoActivity),
            "sent_no_activity",
            "wait_activity",
            true,
            1,
        ),
        (
            PANE,
            AgentStatus::Idle,
            Err("pane_not_found: x"),
            "failed",
            "prompt_agent",
            true,
            1,
        ),
    ];
    for (pane, status, outcome, state, step, written, prompts) in rows {
        let tmp = tempfile::tempdir().unwrap();
        let folder = tmp.path().join("Mis Proyectos").join("facturación");
        let (app, handles) = test_bridge(tmp.path());
        local_agent(&handles, status, pane, &folder);
        handles.prompter.set_outcome(outcome.map_err(str::to_owned));

        let id = create(&app, files(12)).await;
        let body = wait_final(&app, &id).await;

        assert_eq!(body["state"], state, "{state}: {body}");
        assert_eq!(body["step"], step, "{state}: {body}");
        assert_eq!(folder.join(".herdrop").exists(), written, "{state}");
        let calls = handles.prompter.calls();
        assert_eq!(calls.len(), prompts, "{state}");
        if let Err(message) = outcome {
            assert_eq!(body["message"], message);
        }
        if state == "delivered" {
            let dir = drop_dir(&folder).join(&id);
            assert_eq!(body["machine"], "local");
            assert!(id.parse::<DropId>().is_ok(), "{id}");
            assert_eq!(body["bundle_dir"], dir.display().to_string());
            assert_eq!(entries(&dir).len(), 13);
            for file in files(12) {
                let name = file["name"].as_str().unwrap();
                let content = std::fs::read_to_string(dir.join(name)).unwrap();
                assert_eq!(content, file["content"].as_str().unwrap());
            }
            assert_eq!(
                calls[0].line,
                format!(
                    "Herdrop: read {} and act on the annotations.",
                    dir.join("README.md").display()
                )
            );
        }
    }
}

#[tokio::test]
async fn retry_restarts_at_check_agent_and_reuses_bundle() {
    let tmp = tempfile::tempdir().unwrap();
    let folder = tmp.path().join("work");
    let (app, handles) = test_bridge(tmp.path());
    local_agent(&handles, AgentStatus::Idle, PANE, &folder);
    handles.prompter.set_outcome(Ok(PromptOutcome::NoActivity));
    let id = create(&app, files(2)).await;
    assert_eq!(wait_final(&app, &id).await["state"], "sent_no_activity");
    let annotation = drop_dir(&folder).join(&id).join("A1.md");
    std::fs::write(&annotation, "edited").unwrap();
    handles.prompter.set_outcome(Ok(PromptOutcome::Delivered));

    let (status, _, body) = post_json(&app, &format!("/drops/{id}/retry"), &json!({})).await;

    assert_eq!(status, StatusCode::ACCEPTED);
    assert_eq!(body["drop_id"], id.as_str());
    assert_eq!(wait_final(&app, &id).await["state"], "delivered");
    assert_eq!(std::fs::read_to_string(&annotation).unwrap(), "edited");
    assert_eq!(entries(&drop_dir(&folder)), std::slice::from_ref(&id));
    assert_eq!(handles.prompter.calls().len(), 2);

    let (status, _, body) = post_json(&app, &format!("/drops/{id}/retry"), &json!({})).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error"]["code"], "drop_not_retryable");
}

#[tokio::test]
async fn one_client_request_id_starts_one_drop() {
    let tmp = tempfile::tempdir().unwrap();
    let folder = tmp.path().join("work");
    let (app, handles) = test_bridge(tmp.path());
    local_agent(&handles, AgentStatus::Idle, PANE, &folder);
    let body = create_body(REQUEST_ID, files(1));

    let (first, second) = tokio::join!(
        post_json(&app, "/drops", &body),
        post_json(&app, "/drops", &body)
    );
    let third = post_json(&app, "/drops", &body).await;

    let ids: Vec<Value> = [first, second, third]
        .into_iter()
        .map(|(status, _, body)| {
            assert_eq!(status, StatusCode::ACCEPTED, "{body}");
            body["drop_id"].clone()
        })
        .collect();
    assert!(ids.iter().all(|id| id == &ids[0]), "{ids:?}");
    let id = ids[0].as_str().unwrap();
    assert_eq!(wait_final(&app, id).await["state"], "delivered");
    assert_eq!(handles.prompter.calls().len(), 1);
    assert_eq!(entries(&drop_dir(&folder)), [id.to_owned()]);
}

#[tokio::test]
async fn request_rejection_table() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, _handles) = test_bridge(tmp.path());
    let long_id = "a".repeat(65);
    let mut cases: Vec<(String, Value, StatusCode, &str)> = ["", "a b", "a_b", long_id.as_str()]
        .into_iter()
        .map(|request_id| {
            (
                "/drops".to_owned(),
                create_body(request_id, files(1)),
                StatusCode::BAD_REQUEST,
                "invalid_request",
            )
        })
        .collect();
    let bad_bundles = [
        vec![
            json!({"name": "README.md", "content": ""}),
            json!({"name": "../A1.md", "content": ""}),
        ],
        vec![
            json!({"name": "README.md", "content": ""}),
            json!({"name": "A0.md", "content": ""}),
        ],
        vec![json!({"name": "A1.md", "content": ""})],
    ];
    for bundle in bad_bundles {
        cases.push((
            "/drops".to_owned(),
            create_body(&fresh_id(), bundle),
            StatusCode::BAD_REQUEST,
            "invalid_bundle",
        ));
    }
    let mut unknown_machine = create_body(&fresh_id(), files(1));
    unknown_machine["machine"] = json!("aa11bb22cc33dd44ee55ff6600778899");
    cases.push((
        "/drops".to_owned(),
        unknown_machine,
        StatusCode::NOT_FOUND,
        "unknown_machine",
    ));
    cases.push((
        format!("/drops/{UNKNOWN_DROP}/retry"),
        json!({}),
        StatusCode::NOT_FOUND,
        "drop_not_found",
    ));

    for (path, body, status, code) in cases {
        let (actual, _, response) = post_json(&app, &path, &body).await;

        assert_eq!(actual, status, "{body}: {response}");
        assert_eq!(response["error"]["code"], code, "{body}");
    }
    let (status, _, response) = get(&app, &format!("/drops/{UNKNOWN_DROP}")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(response["error"]["code"], "drop_not_found");
}
