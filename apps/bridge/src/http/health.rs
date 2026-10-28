use std::path::Path;
use std::sync::Arc;

use axum::Json;

use crate::protocol::Health;
use crate::unpacked;

pub async fn health(extension_dir: Arc<Path>) -> Json<Health> {
    let manifest = tokio::fs::read(extension_dir.join(unpacked::MANIFEST)).await;
    Json(Health {
        name: "herdrop".to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        extension_version: manifest
            .ok()
            .and_then(|bytes| unpacked::parse_version(&bytes)),
    })
}
