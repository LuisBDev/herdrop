pub mod agents;
pub mod drops;
pub mod error;
pub mod health;
pub mod security;

use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::{Router, middleware};

use crate::app::bridge::Bridge;
use crate::ports::{AgentDirectory, AgentPrompter, BundleStore};
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
        .route("/drops", post(drops::create::<D, S, P>))
        .route("/drops/{id}", get(drops::status::<D, S, P>))
        .route("/drops/{id}/retry", post(drops::retry::<D, S, P>))
        .with_state(bridge)
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        .layer(middleware::from_fn_with_state(security, guard))
}
