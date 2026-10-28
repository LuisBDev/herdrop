mod support;

use axum::http::StatusCode;
use serde_json::json;
use support::{get, test_bridge};

#[tokio::test]
async fn health_reports_the_deployed_extension_version() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, _handles) = test_bridge(tmp.path());

    let (status, _, body) = get(&app, "/health").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "name": "herdrop",
            "version": env!("CARGO_PKG_VERSION"),
            "extension_version": null,
        })
    );

    let extension = tmp.path().join("extension");
    std::fs::create_dir_all(&extension).unwrap();
    std::fs::write(
        extension.join("manifest.json"),
        r#"{"manifest_version":3,"version":"0.2.0","version_name":"0.2.0-rc.1"}"#,
    )
    .unwrap();

    let (_, _, body) = get(&app, "/health").await;
    assert_eq!(body["extension_version"], "0.2.0-rc.1");
}
