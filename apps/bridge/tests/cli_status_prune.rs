mod cli_support;

use std::time::Duration;

use cli_support::{ChildGuard, free_port, herdrop, wait_until};
use herdrop::cli::probe;
use herdrop::domain::ids::DropId;
use jiff::Timestamp;

#[tokio::test]
async fn status_reports_running_and_not_running() {
    let tmp = tempfile::tempdir().unwrap();
    let port = free_port();

    let idle = herdrop(tmp.path())
        .arg("status")
        .arg("--port")
        .arg(port.to_string())
        .output()
        .unwrap();
    assert!(idle.status.success());
    assert_eq!(
        String::from_utf8_lossy(&idle.stdout).trim(),
        "Bridge not running"
    );

    let child = herdrop(tmp.path())
        .arg("serve")
        .arg("--port")
        .arg(port.to_string())
        .arg("--no-warm")
        .spawn()
        .unwrap();
    let _guard = ChildGuard(child);
    assert!(wait_until(Duration::from_secs(5), || probe::health(port)).await);

    let running = herdrop(tmp.path())
        .arg("status")
        .arg("--port")
        .arg(port.to_string())
        .output()
        .unwrap();
    assert!(running.status.success());
    assert_eq!(
        String::from_utf8_lossy(&running.stdout).trim(),
        format!("Bridge running on 127.0.0.1:{port}, v0.1.0")
    );
}

#[test]
fn prune_removes_old_bundles_in_focused_pane_folder() {
    let tmp = tempfile::tempdir().unwrap();
    let project = tmp.path().join("proj");
    let drops = project.join(".herdrop").join("drop");
    let old = drops.join("20200101-000000-aaaa");
    let fresh_id = DropId::generate(Timestamp::now(), &mut fastrand::Rng::with_seed(1));
    let fresh = drops.join(fresh_id.as_str());
    std::fs::create_dir_all(&old).unwrap();
    std::fs::create_dir_all(&fresh).unwrap();
    let context = serde_json::json!({ "focused_pane_cwd": project }).to_string();

    let output = herdrop(tmp.path())
        .arg("prune")
        .env("HERDR_PLUGIN_CONTEXT_JSON", context)
        .output()
        .unwrap();

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "Pruned 1 old drops"
    );
    assert!(!old.exists());
    assert!(fresh.exists());
}
