use axum::Json;

use crate::protocol::Health;

pub async fn health() -> Json<Health> {
    Json(Health {
        name: "herdrop".to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
    })
}
