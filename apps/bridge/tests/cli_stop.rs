mod cli_support;

use std::process::{Command, Stdio};
use std::time::Duration;

use cli_support::{ChildGuard, PidGuard, free_port, herdrop, wait_until};
use herdrop::cli::paths::PidRecord;
use herdrop::cli::probe;

#[tokio::test]
async fn stop_ends_a_started_bridge() {
    let tmp = tempfile::tempdir().unwrap();
    let pid_file = tmp.path().join("state").join("herdrop.pid");
    let _pid_guard = PidGuard(pid_file.clone());
    let port = free_port();
    let started = herdrop(tmp.path())
        .args(["start", "--port", &port.to_string(), "--no-warm"])
        .output()
        .unwrap();
    assert!(
        started.status.success(),
        "{}",
        String::from_utf8_lossy(&started.stdout)
    );

    let output = herdrop(tmp.path()).arg("stop").output().unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "{stdout}");
    let stopped = wait_until(Duration::from_secs(5), || async {
        !probe::health(port).await
    })
    .await;
    assert!(stopped);
    assert!(!pid_file.exists());
}

#[tokio::test]
async fn stop_leaves_unrelated_process_alive_and_removes_stale_pid_file() {
    let tmp = tempfile::tempdir().unwrap();
    let state = tmp.path().join("state");
    std::fs::create_dir_all(&state).unwrap();
    let pid_file = state.join("herdrop.pid");
    let _pid_guard = PidGuard(pid_file.clone());
    let mut unrelated = ChildGuard(unrelated_child());
    PidRecord {
        pid: unrelated.0.id(),
        port: free_port(),
    }
    .write(&pid_file)
    .unwrap();

    let output = herdrop(tmp.path()).arg("stop").output().unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "{stdout}");
    assert!(unrelated.0.try_wait().unwrap().is_none());
    assert!(!pid_file.exists());
}

#[cfg(windows)]
fn unrelated_child() -> std::process::Child {
    Command::new("ping")
        .args(["-n", "30", "127.0.0.1"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap()
}

#[cfg(not(windows))]
fn unrelated_child() -> std::process::Child {
    Command::new("sleep")
        .arg("30")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap()
}
