mod cli_support;

use std::net::TcpListener;
use std::sync::mpsc;
use std::time::Duration;

use cli_support::{ChildGuard, PidGuard, free_port, herdrop, wait_until};
use herdrop::cli::paths::PidRecord;
use herdrop::cli::probe;

const PIPE_DEADLINE: Duration = Duration::from_secs(7);

#[tokio::test]
async fn start_is_idempotent_when_bridge_runs() {
    let tmp = tempfile::tempdir().unwrap();
    let pid_file = tmp.path().join("state").join("herdrop.pid");
    let _pid_guard = PidGuard(pid_file.clone());
    let port = free_port();
    let child = herdrop(tmp.path())
        .args(["serve", "--port", &port.to_string(), "--no-warm"])
        .spawn()
        .unwrap();
    let _child_guard = ChildGuard(child);
    assert!(wait_until(Duration::from_secs(5), || probe::health(port)).await);

    let output = herdrop(tmp.path())
        .args(["start", "--port", &port.to_string(), "--no-warm"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "{stdout}");
    assert!(stdout.contains("already running"), "{stdout}");
    assert!(!pid_file.exists());
}

#[tokio::test]
async fn start_detaches_and_closes_its_output_pipes() {
    let tmp = tempfile::tempdir().unwrap();
    let pid_file = tmp.path().join("state").join("herdrop.pid");
    let _pid_guard = PidGuard(pid_file.clone());
    let port = free_port();
    let mut command = herdrop(tmp.path());
    command.args(["start", "--port", &port.to_string(), "--no-warm"]);

    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = sender.send(command.output());
    });
    let output = receiver
        .recv_timeout(PIPE_DEADLINE)
        .expect("start kept its output pipes open")
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "{stdout}");
    let record = PidRecord::read(&pid_file).unwrap().expect("pid file");
    assert_eq!(record.port, port);
    assert!(probe::health(port).await);
}

#[tokio::test]
async fn start_reports_the_log_path_when_serve_fails() {
    let tmp = tempfile::tempdir().unwrap();
    let _pid_guard = PidGuard(tmp.path().join("state").join("herdrop.pid"));
    let occupied = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = occupied.local_addr().unwrap().port();

    let output = herdrop(tmp.path())
        .args(["start", "--port", &port.to_string(), "--no-warm"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert_eq!(output.status.code(), Some(1), "{stdout}");
    assert!(stdout.contains("herdrop.log"), "{stdout}");
}
