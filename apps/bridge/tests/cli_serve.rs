mod cli_support;

use std::time::Duration;

use cli_support::{ChildGuard, free_port, herdrop, wait_until};
use herdrop::cli::probe;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const REJECTION: &str = "rejected code=forbidden_origin method=POST origin=http://localhost:4310";

async fn post_drops_from_foreign_origin(port: u16) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let request = format!(
        "POST /drops HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: http://localhost:4310\r\nContent-Type: application/json\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await.unwrap();
    String::from_utf8_lossy(&response).into_owned()
}

#[tokio::test]
async fn serve_answers_health_and_logs_rejections_to_the_file() {
    let tmp = tempfile::tempdir().unwrap();
    let port = free_port();
    let log = tmp.path().join("state").join("herdrop.log");
    let child = herdrop(tmp.path())
        .arg("serve")
        .arg("--port")
        .arg(port.to_string())
        .arg("--no-warm")
        .arg("--log-file")
        .arg(&log)
        .spawn()
        .unwrap();
    let _guard = ChildGuard(child);

    assert!(wait_until(Duration::from_secs(5), || probe::health(port)).await);

    let response = post_drops_from_foreign_origin(port).await;
    assert!(response.starts_with("HTTP/1.1 403 "), "{response}");

    let logged = wait_until(Duration::from_secs(2), || {
        let log = log.clone();
        async move { std::fs::read_to_string(&log).is_ok_and(|text| text.contains(REJECTION)) }
    })
    .await;
    assert!(logged, "{:?}", std::fs::read_to_string(&log));
}
