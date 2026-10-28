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

const FAKE_BRIDGE_TEST: &str = "fake_bridge";
const OLD_VERSION: &str = "0.0.1";

#[test]
#[ignore = "helper process that spawn_fake_bridge launches"]
fn fake_bridge() {
    let (Ok(port), Ok(version)) = (
        std::env::var(cli_support::FAKE_PORT_ENV),
        std::env::var(cli_support::FAKE_VERSION_ENV),
    ) else {
        return;
    };
    let listener = TcpListener::bind(("127.0.0.1", port.parse::<u16>().unwrap())).unwrap();
    cli_support::serve_fake_health(listener, &version);
}

async fn version_on(port: u16) -> Option<String> {
    probe::bridge(port).await.map(|health| health.version)
}

#[tokio::test]
async fn start_replaces_a_recorded_bridge_of_another_version() {
    let tmp = tempfile::tempdir().unwrap();
    let state = tmp.path().join("state");
    std::fs::create_dir_all(&state).unwrap();
    let pid_file = state.join("herdrop.pid");
    let _pid_guard = PidGuard(pid_file.clone());
    let port = free_port();
    let mut old = ChildGuard(cli_support::spawn_fake_bridge(
        tmp.path(),
        FAKE_BRIDGE_TEST,
        port,
        OLD_VERSION,
    ));
    let old_up = wait_until(Duration::from_secs(5), || async {
        version_on(port).await.as_deref() == Some(OLD_VERSION)
    })
    .await;
    assert!(old_up, "the fake bridge did not answer");
    PidRecord {
        pid: old.0.id(),
        port,
    }
    .write(&pid_file)
    .unwrap();

    let output = herdrop(tmp.path())
        .args(["start", "--port", &port.to_string(), "--no-warm"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "{stdout}\n{stderr}");
    assert!(
        stdout.contains(&format!("replaced herdrop {OLD_VERSION}")),
        "{stdout}"
    );
    assert_eq!(
        version_on(port).await.as_deref(),
        Some(env!("CARGO_PKG_VERSION"))
    );
    assert!(
        old.0.try_wait().unwrap().is_some(),
        "the old bridge survived"
    );
    let record = PidRecord::read(&pid_file).unwrap().expect("pid file");
    assert_eq!(record.port, port);
    assert_ne!(record.pid, old.0.id());
}

#[tokio::test]
async fn start_leaves_an_unrecorded_bridge_of_another_version_running() {
    let tmp = tempfile::tempdir().unwrap();
    let pid_file = tmp.path().join("state").join("herdrop.pid");
    let _pid_guard = PidGuard(pid_file.clone());
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || cli_support::serve_fake_health(listener, OLD_VERSION));

    let output = herdrop(tmp.path())
        .args(["start", "--port", &port.to_string(), "--no-warm"])
        .output()
        .unwrap();

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(1), "{stderr}");
    assert!(
        stderr.contains(&format!("herdrop {OLD_VERSION} answers")),
        "{stderr}"
    );
    assert_eq!(version_on(port).await.as_deref(), Some(OLD_VERSION));
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
    let pid_file = tmp.path().join("state").join("herdrop.pid");
    let _pid_guard = PidGuard(pid_file.clone());
    let occupied = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = occupied.local_addr().unwrap().port();

    let output = herdrop(tmp.path())
        .args(["start", "--port", &port.to_string(), "--no-warm"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert_eq!(output.status.code(), Some(1), "{stdout}");
    assert!(stdout.contains("herdrop.log"), "{stdout}");
    assert!(!pid_file.exists());
}
