use std::io;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use crate::protocol::Health;

const TIMEOUT: Duration = Duration::from_secs(2);
const HEALTH_NAME: &str = "herdrop";

pub async fn health(port: u16) -> bool {
    match tokio::time::timeout(TIMEOUT, fetch(port)).await {
        Ok(Ok(response)) => is_healthy(&response),
        _ => false,
    }
}

async fn fetch(port: u16) -> io::Result<String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await?;
    let request =
        format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).await?;
    let mut bytes = Vec::new();
    stream.read_to_end(&mut bytes).await?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn is_healthy(response: &str) -> bool {
    let status_ok = response
        .lines()
        .next()
        .is_some_and(|line| line.contains(" 200 "));
    let body_ok = response.split_once("\r\n\r\n").is_some_and(|(_, body)| {
        serde_json::from_str::<Health>(body).is_ok_and(|health| health.name == HEALTH_NAME)
    });
    status_ok && body_ok
}
