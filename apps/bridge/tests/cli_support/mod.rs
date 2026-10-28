#![allow(dead_code)]

use std::future::Future;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use herdrop::cli::paths::PidRecord;

const POLL: Duration = Duration::from_millis(50);
const HERDR_VARS: [&str; 7] = [
    "HERDR_ENV",
    "HERDR_PLUGIN_ROOT",
    "HERDR_SOCKET_PATH",
    "HERDR_PANE_ID",
    "HERDR_WORKSPACE_ID",
    "HERDR_TAB_ID",
    "HERDR_PLUGIN_CONTEXT_JSON",
];

pub fn herdrop(tmp: &Path) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_herdrop"));
    for var in HERDR_VARS {
        command.env_remove(var);
    }
    command
        .env("HERDR_BIN_PATH", tmp.join("no-herdr").join("herdr.exe"))
        .env("HERDR_PLUGIN_STATE_DIR", tmp.join("state"))
        .env("HERDR_PLUGIN_CONFIG_DIR", tmp.join("config"))
        .stdin(Stdio::null());
    command
}

pub fn free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind an ephemeral port");
    listener.local_addr().expect("read the bound port").port()
}

pub struct ChildGuard(pub Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

pub struct PidGuard(pub PathBuf);

impl Drop for PidGuard {
    fn drop(&mut self) {
        if let Ok(Some(record)) = PidRecord::read(&self.0) {
            force_kill(record.pid);
        }
    }
}

#[cfg(windows)]
fn force_kill(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(windows))]
fn force_kill(pid: u32) {
    let _ = Command::new("kill")
        .args(["-KILL", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

pub const FAKE_PORT_ENV: &str = "HERDROP_TEST_FAKE_PORT";
pub const FAKE_VERSION_ENV: &str = "HERDROP_TEST_FAKE_VERSION";

pub fn serve_fake_health(listener: TcpListener, version: &str) {
    let body = format!(r#"{{"name":"herdrop","version":"{version}"}}"#);
    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { continue };
        let mut request = Vec::new();
        let mut chunk = [0u8; 512];
        while !request.windows(4).any(|w| w == b"\r\n\r\n") {
            match stream.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(read) => request.extend_from_slice(&chunk[..read]),
            }
        }
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len()
        );
    }
}

pub fn spawn_fake_bridge(tmp: &Path, helper_test: &str, port: u16, version: &str) -> Child {
    let dir = tmp.join("fake");
    std::fs::create_dir_all(&dir).unwrap();
    let exe = dir.join(format!("herdrop{}", std::env::consts::EXE_SUFFIX));
    std::fs::copy(std::env::current_exe().unwrap(), &exe).unwrap();
    Command::new(exe)
        .args([helper_test, "--exact", "--ignored", "--nocapture"])
        .env(FAKE_PORT_ENV, port.to_string())
        .env(FAKE_VERSION_ENV, version)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap()
}

pub async fn wait_until<F, Fut>(timeout: Duration, mut predicate: F) -> bool
where
    F: FnMut() -> Fut,
    Fut: Future<Output = bool>,
{
    let deadline = Instant::now() + timeout;
    loop {
        if predicate().await {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(POLL).await;
    }
}
