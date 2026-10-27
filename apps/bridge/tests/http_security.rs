mod support;

use axum::body::Body;
use axum::http::header::{CONTENT_TYPE, HOST, ORIGIN};
use axum::http::{Method, Request, StatusCode};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use herdrop::extension_id::bundled_extension_id;
use sha2::{Digest, Sha256};
use support::{extension_origin, send, test_bridge};

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../packages/protocol/fixtures/extension.json"
);

enum Expect {
    Status(StatusCode),
    Rejected(&'static str),
    OptionsRejected,
    ReachedHandler,
}

type Row<'a> = (Method, &'a str, Option<&'a str>, Option<&'a str>, Expect);

#[tokio::test]
async fn guard_table() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, _handles) = test_bridge(tmp.path());
    let extension = extension_origin();
    let rows: [Row; 9] = [
        (
            Method::GET,
            "/health",
            Some("evil.example:47821"),
            None,
            Expect::Rejected("forbidden_host"),
        ),
        (
            Method::GET,
            "/health",
            Some("127.0.0.1:1"),
            None,
            Expect::Rejected("forbidden_host"),
        ),
        (
            Method::GET,
            "/health",
            None,
            None,
            Expect::Rejected("forbidden_host"),
        ),
        (
            Method::GET,
            "/health",
            Some("localhost:47821"),
            None,
            Expect::Status(StatusCode::OK),
        ),
        (
            Method::GET,
            "/health",
            Some("127.0.0.1:47821"),
            Some("http://localhost:4200"),
            Expect::Rejected("forbidden_origin"),
        ),
        (
            Method::POST,
            "/drops",
            Some("127.0.0.1:47821"),
            None,
            Expect::Rejected("forbidden_origin"),
        ),
        (
            Method::POST,
            "/drops",
            Some("127.0.0.1:47821"),
            Some("http://localhost:4200"),
            Expect::Rejected("forbidden_origin"),
        ),
        (
            Method::OPTIONS,
            "/drops",
            Some("127.0.0.1:47821"),
            Some("http://localhost:4200"),
            Expect::OptionsRejected,
        ),
        (
            Method::POST,
            "/drops",
            Some("127.0.0.1:47821"),
            Some(extension.as_str()),
            Expect::ReachedHandler,
        ),
    ];

    for (method, path, host, origin, expect) in rows {
        let label = format!("{method} {path} host={host:?} origin={origin:?}");
        let mut request = Request::builder().method(method.clone()).uri(path);
        if let Some(host) = host {
            request = request.header(HOST, host);
        }
        if let Some(origin) = origin {
            request = request.header(ORIGIN, origin);
        }
        let body = if method == Method::POST {
            request = request.header(CONTENT_TYPE, "application/json");
            Body::from("{}")
        } else {
            Body::empty()
        };

        let (status, headers, json) = send(&app, request.body(body).unwrap()).await;

        assert!(
            headers
                .keys()
                .all(|name| !name.as_str().starts_with("access-control-")),
            "{label}: cors header present"
        );
        match expect {
            Expect::Status(expected) => assert_eq!(status, expected, "{label}"),
            Expect::Rejected(code) => {
                assert_eq!(status, StatusCode::FORBIDDEN, "{label}");
                assert_eq!(json["error"]["code"], code, "{label}");
            }
            Expect::OptionsRejected => assert_eq!(status, StatusCode::FORBIDDEN, "{label}"),
            Expect::ReachedHandler => assert!(
                status.is_client_error() && status != StatusCode::FORBIDDEN,
                "{label}: {status}"
            ),
        }
    }
}

#[test]
fn bundled_extension_id_matches_extension_key() {
    let fixture: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(FIXTURE).unwrap()).unwrap();
    let key = STANDARD.decode(fixture["key"].as_str().unwrap()).unwrap();

    let digest = Sha256::digest(&key);
    let derived: String = digest
        .iter()
        .take(16)
        .flat_map(|byte| [byte >> 4, byte & 0x0f])
        .map(|nibble| char::from(b'a' + nibble))
        .collect();

    assert_eq!(derived, bundled_extension_id());
}
