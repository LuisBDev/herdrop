use std::sync::Arc;

use axum::Json;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Query, State};
use serde::Deserialize;

use crate::app::bridge::Bridge;
use crate::domain::ids::MachineKey;
use crate::http::error::ApiFailure;
use crate::ports::{AgentDirectory, AgentPrompter, BundleStore};
use crate::protocol::{AgentsResponse, MachinesResponse};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentsQuery {
    machine: String,
    #[serde(default)]
    refresh: bool,
}

pub async fn machines<D: AgentDirectory, S: BundleStore, P: AgentPrompter>(
    State(bridge): State<Arc<Bridge<D, S, P>>>,
) -> Json<MachinesResponse> {
    Json(bridge.machines().await)
}

pub async fn agents<D: AgentDirectory, S: BundleStore, P: AgentPrompter>(
    State(bridge): State<Arc<Bridge<D, S, P>>>,
    query: Result<Query<AgentsQuery>, QueryRejection>,
) -> Result<Json<AgentsResponse>, ApiFailure> {
    let Query(query) =
        query.map_err(|rejection| ApiFailure::invalid_request(rejection.body_text()))?;
    let key: MachineKey = query
        .machine
        .parse()
        .map_err(|_| ApiFailure::unknown_machine(&query.machine))?;
    bridge.agents(&key, query.refresh).await.map(Json)
}
