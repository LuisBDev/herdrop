use std::io;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use crate::protocol::Health;

const TIMEOUT: Duration = Duration::from_secs(2);
const HEALTH_NAME: &str = "herdrop";

pub async fn bridge(port: u16) -> Option<Health> {
    match tokio::time::timeout(TIMEOUT, fetch(port)).await {
        Ok(Ok(response)) => parse_health(&response),
        _ => None,
    }
}

pub async fn health(port: u16) -> bool {
    bridge(port).await.is_some()
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

fn parse_health(response: &str) -> Option<Health> {
    let status_ok = response
        .lines()
        .next()
        .is_some_and(|line| line.contains(" 200 "));
    let (_, body) = response.split_once("\r\n\r\n")?;
    let health: Health = serde_json::from_str(body).ok()?;
    (status_ok && health.name == HEALTH_NAME).then_some(health)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_health_requires_ok_status_and_herdrop_health_body() {
        let response = |status: &str, body: &str| {
            format!("HTTP/1.1 {status}\r\ncontent-type: application/json\r\n\r\n{body}")
        };
        let rows = [
            (
                response("200 OK", r#"{"name":"herdrop","version":"0.1.0"}"#),
                Some("0.1.0"),
            ),
            (
                response(
                    "200 OK",
                    r#"{"name":"herdrop","version":"0.2.0","extension_version":"0.2.0"}"#,
                ),
                Some("0.2.0"),
            ),
            (
                response("200 OK", r#"{"name":"other","version":"0.1.0"}"#),
                None,
            ),
            (
                response("403 Forbidden", r#"{"name":"herdrop","version":"0.1.0"}"#),
                None,
            ),
            (response("200 OK", "herdrop"), None),
        ];
        for (raw, expected) in rows {
            let version = parse_health(&raw).map(|health| health.version);
            assert_eq!(version.as_deref(), expected, "{raw}");
        }
    }
}
