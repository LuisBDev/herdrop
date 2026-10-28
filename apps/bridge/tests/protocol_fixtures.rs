use herdrop::protocol::{
    AgentsResponse, ApiError, CreateDropRequest, CreateDropResponse, DropStatus, Health,
    MachinesResponse,
};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;

const FIXTURES: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../packages/protocol/fixtures/"
);

type Check = fn(&str);

fn round_trip<T: Serialize + DeserializeOwned>(name: &str) {
    let path = format!("{FIXTURES}{name}.json");
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
    let original: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name}: {e}"));
    let typed: T =
        serde_json::from_value(original.clone()).unwrap_or_else(|e| panic!("{name}: {e}"));
    let again = serde_json::to_value(&typed).unwrap_or_else(|e| panic!("{name}: {e}"));
    assert_eq!(again, original, "{name}");
}

#[test]
fn every_fixture_round_trips_through_serde() {
    let table: &[(&str, Check)] = &[
        ("health", round_trip::<Health>),
        ("machines", round_trip::<MachinesResponse>),
        ("machines-herdr-missing", round_trip::<MachinesResponse>),
        ("agents-local", round_trip::<AgentsResponse>),
        ("agents-remote-refreshing", round_trip::<AgentsResponse>),
        ("agents-remote-error", round_trip::<AgentsResponse>),
        ("create-drop-request", round_trip::<CreateDropRequest>),
        ("create-drop-response", round_trip::<CreateDropResponse>),
        ("drop-status-running", round_trip::<DropStatus>),
        ("drop-status-delivered", round_trip::<DropStatus>),
        ("drop-status-agent-blocked", round_trip::<DropStatus>),
        ("drop-status-failed", round_trip::<DropStatus>),
        ("api-error", round_trip::<ApiError>),
        ("api-error-drop-not-found", round_trip::<ApiError>),
        ("api-error-invalid-request", round_trip::<ApiError>),
    ];
    for (name, check) in table {
        check(name);
    }
}

#[test]
fn health_from_a_bridge_without_extension_version_parses() {
    let text = std::fs::read_to_string(format!("{FIXTURES}health-legacy.json")).unwrap();
    let health: Health = serde_json::from_str(&text).unwrap();
    assert_eq!(health.version, "0.1.0");
    assert_eq!(health.extension_version, None);
}

#[test]
fn create_drop_request_rejects_bad_bodies() {
    let table = [
        (
            "extra top-level key",
            r#"{"client_request_id":"a","machine":"local","pane_id":"w1:p1","files":[],"extra":1}"#,
        ),
        (
            "extra key inside a file",
            r#"{"client_request_id":"a","machine":"local","pane_id":"w1:p1","files":[{"name":"A1.md","content":"x","mode":420}]}"#,
        ),
        (
            "missing client_request_id",
            r#"{"machine":"local","pane_id":"w1:p1","files":[]}"#,
        ),
    ];
    for (case, body) in table {
        assert!(
            serde_json::from_str::<CreateDropRequest>(body).is_err(),
            "{case}"
        );
    }
}
