mod cli_support;

use std::time::Duration;

use clap::Parser;
use clap::error::ErrorKind;
use cli_support::{ChildGuard, free_port, herdrop, wait_until};
use herdrop::cli::{Cli, probe};
use herdrop::extension_id::bundled_extension_id;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const FOREIGN_ORIGIN: &str = "http://localhost:4310";

async fn post_empty_drop(port: u16, origin: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let request = format!(
        "POST /drops HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {origin}\r\nContent-Type: application/json\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
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
    let extension_origin = format!("chrome-extension://{}", bundled_extension_id());
    let forbidden = format!("rejected code=forbidden_origin method=POST origin={FOREIGN_ORIGIN}");
    let invalid = format!("rejected code=invalid_request method=POST origin={extension_origin}");
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

    let response = post_empty_drop(port, FOREIGN_ORIGIN).await;
    assert!(response.starts_with("HTTP/1.1 403 "), "{response}");
    let response = post_empty_drop(port, &extension_origin).await;
    assert!(response.starts_with("HTTP/1.1 400 "), "{response}");

    let logged = wait_until(Duration::from_secs(2), || {
        let log = log.clone();
        let invalid = invalid.clone();
        async move { std::fs::read_to_string(&log).is_ok_and(|text| text.contains(&invalid)) }
    })
    .await;
    let text = std::fs::read_to_string(&log).unwrap_or_default();
    assert!(logged, "{text}");
    assert_eq!(text.matches(&forbidden).count(), 1, "{text}");
    assert_eq!(text.matches("rejected").count(), 2, "{text}");

    let port_zero = Cli::try_parse_from(["herdrop", "serve", "--port", "0", "--no-warm"]);
    assert!(matches!(
        port_zero.map_err(|error| error.kind()),
        Err(ErrorKind::ValueValidation)
    ));
}
