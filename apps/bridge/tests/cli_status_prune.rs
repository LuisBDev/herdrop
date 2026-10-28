mod cli_support;

use std::path::{Path, PathBuf};
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
    let warned = String::from_utf8_lossy(&idle.stderr);
    assert!(
        warned.contains("WARN") && warned.contains("herdr notification"),
        "{warned}"
    );

    let packaged = tmp.path().join("plugin").join("extension");
    std::fs::create_dir_all(&packaged).unwrap();
    std::fs::write(
        packaged.join("manifest.json"),
        r#"{"manifest_version":3,"version":"9.9.9"}"#,
    )
    .unwrap();
    let child = herdrop(tmp.path())
        .env("HERDR_PLUGIN_ROOT", tmp.path().join("plugin"))
        .arg("serve")
        .arg("--port")
        .arg(port.to_string())
        .arg("--no-warm")
        .spawn()
        .unwrap();
    let _guard = ChildGuard(child);
    assert!(wait_until(Duration::from_secs(5), || probe::health(port)).await);

    let running = status(tmp.path(), port);
    let extension_dir = tmp.path().join("state").join("extension");
    assert_eq!(
        running,
        format!(
            "Bridge running on 127.0.0.1:{port}, v{}. Extension v9.9.9 at {}",
            env!("CARGO_PKG_VERSION"),
            extension_dir.display()
        )
    );
}

#[tokio::test]
async fn status_reports_the_version_the_running_bridge_answers_with() {
    let tmp = tempfile::tempdir().unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || cli_support::serve_fake_health(listener, "0.0.1"));

    let running = status(tmp.path(), port);

    let extension_dir = tmp.path().join("state").join("extension");
    assert_eq!(
        running,
        format!(
            "Bridge running on 127.0.0.1:{port}, v0.0.1. No extension at {}",
            extension_dir.display()
        )
    );
}

#[test]
fn extension_path_prints_the_deployed_extension_folder() {
    let tmp = tempfile::tempdir().unwrap();

    let output = herdrop(tmp.path()).arg("extension-path").output().unwrap();

    assert!(output.status.success());
    assert_eq!(
        Path::new(String::from_utf8_lossy(&output.stdout).trim()),
        tmp.path().join("state").join("extension")
    );
}

fn status(tmp: &Path, port: u16) -> String {
    let output = herdrop(tmp)
        .arg("status")
        .arg("--port")
        .arg(port.to_string())
        .output()
        .unwrap();
    assert!(output.status.success());
    String::from_utf8_lossy(&output.stdout).trim().to_owned()
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

    let remote =
        serde_json::json!({ "focused_pane_cwd": tmp.path().join("remote-only") }).to_string();
    let output = herdrop(tmp.path())
        .arg("prune")
        .env("HERDR_PLUGIN_CONTEXT_JSON", remote)
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "Pane folder not found on this PC"
    );

    std::fs::create_dir_all(&old).unwrap();
    let elsewhere =
        serde_json::json!({ "focused_pane_id": "w1:p1", "focused_pane_cwd": project }).to_string();
    let output = herdrop(tmp.path())
        .arg("prune")
        .env("HERDR_BIN_PATH", fake_herdr(tmp.path()))
        .env("HERDR_PLUGIN_CONTEXT_JSON", elsewhere)
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "Pane folder not found on this PC"
    );
    assert!(old.exists());

    let shell =
        serde_json::json!({ "focused_pane_id": "w9:p9", "focused_pane_cwd": project }).to_string();
    let output = herdrop(tmp.path())
        .arg("prune")
        .env("HERDR_BIN_PATH", fake_herdr(tmp.path()))
        .env("HERDR_PLUGIN_CONTEXT_JSON", shell)
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "Pruned 1 old drops"
    );
    assert!(!old.exists());
}

const PANE_LIST: &str = r#"{"result":{"panes":[{"pane_id":"w9:p9"}]}}"#;

#[cfg(windows)]
fn fake_herdr(dir: &Path) -> PathBuf {
    let path = dir.join("herdr.cmd");
    std::fs::write(&path, format!("@echo {PANE_LIST}\r\n")).unwrap();
    path
}

#[cfg(not(windows))]
fn fake_herdr(dir: &Path) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let path = dir.join("herdr");
    std::fs::write(&path, format!("#!/bin/sh\nprintf '%s\\n' '{PANE_LIST}'\n")).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    path
}
