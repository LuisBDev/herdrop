pub mod agents;
pub mod error;
pub mod health;
pub mod security;

use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router, middleware};

use crate::app::bridge::Bridge;
use crate::ports::{AgentDirectory, AgentPrompter, BundleStore};
use crate::protocol::CreateDropRequest;
use error::ApiFailure;
use security::{SecurityConfig, guard};

const BODY_LIMIT: usize = 4 * 1024 * 1024;

pub fn router<D: AgentDirectory, S: BundleStore, P: AgentPrompter>(
    bridge: Arc<Bridge<D, S, P>>,
    security: SecurityConfig,
) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/machines", get(agents::machines::<D, S, P>))
        .route("/agents", get(agents::agents::<D, S, P>))
        .route("/drops", post(create_drop))
        .with_state(bridge)
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        .layer(middleware::from_fn_with_state(security, guard))
}

async fn create_drop(
    request: Result<Json<CreateDropRequest>, JsonRejection>,
) -> Result<StatusCode, ApiFailure> {
    let Json(_request) = request?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}
