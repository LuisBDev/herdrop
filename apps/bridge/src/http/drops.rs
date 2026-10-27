use std::sync::Arc;

use axum::Json;
use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use axum::http::StatusCode;

use crate::app::bridge::Bridge;
use crate::app::registry::{DropRecord, RestartError};
use crate::domain::bundle::{Bundle, BundleError, BundleFileName};
use crate::domain::ids::{ClientRequestId, DropId, MachineKey, PaneId};
use crate::http::error::ApiFailure;
use crate::ports::{AgentDirectory, AgentPrompter, BundleStore};
use crate::protocol::{
    BundleFile, CreateDropRequest, CreateDropResponse, DropState, DropStatus, DropStep,
};

type Accepted = (StatusCode, Json<CreateDropResponse>);

fn accepted(id: &DropId) -> Accepted {
    (
        StatusCode::ACCEPTED,
        Json(CreateDropResponse {
            drop_id: id.as_str().to_owned(),
        }),
    )
}

fn parse_bundle(files: Vec<BundleFile>) -> Result<Bundle, BundleError> {
    let files = files
        .into_iter()
        .map(|file| {
            file.name
                .parse::<BundleFileName>()
                .map(|name| (name, file.content))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Bundle::new(files)
}

fn parse_drop_id(raw: &str) -> Result<DropId, ApiFailure> {
    raw.parse().map_err(|_| ApiFailure::drop_not_found(raw))
}

pub async fn create<D: AgentDirectory, S: BundleStore, P: AgentPrompter>(
    State(bridge): State<Arc<Bridge<D, S, P>>>,
    request: Result<Json<CreateDropRequest>, JsonRejection>,
) -> Result<Accepted, ApiFailure> {
    let Json(request) = request?;
    let request_id = request
        .client_request_id
        .parse::<ClientRequestId>()
        .map_err(|error| ApiFailure::invalid_request(error.to_string()))?;
    if let Some(id) = bridge.drops.find_by_request(&request_id) {
        return Ok(accepted(&id));
    }
    let key: MachineKey = request
        .machine
        .parse()
        .map_err(|_| ApiFailure::unknown_machine(&request.machine))?;
    let machine = bridge.resolve(&key).await?;
    let pane = request
        .pane_id
        .parse::<PaneId>()
        .map_err(|error| ApiFailure::invalid_request(error.to_string()))?;
    let bundle = parse_bundle(request.files)
        .map_err(|error| ApiFailure::invalid_bundle(error.to_string()))?;
    let id = DropId::generate(bridge.now(), &mut fastrand::Rng::new());
    let id = bridge.start(DropRecord {
        id,
        request_id,
        machine,
        pane,
        state: DropState::Running,
        step: DropStep::CheckAgent,
        written: None,
        message: None,
        bundle: Arc::new(bundle),
    });
    Ok(accepted(&id))
}

pub async fn status<D: AgentDirectory, S: BundleStore, P: AgentPrompter>(
    State(bridge): State<Arc<Bridge<D, S, P>>>,
    Path(raw): Path<String>,
) -> Result<Json<DropStatus>, ApiFailure> {
    let id = parse_drop_id(&raw)?;
    bridge
        .drops
        .get(&id)
        .map(|record| Json(record.status()))
        .ok_or_else(|| ApiFailure::drop_not_found(&raw))
}

pub async fn retry<D: AgentDirectory, S: BundleStore, P: AgentPrompter>(
    State(bridge): State<Arc<Bridge<D, S, P>>>,
    Path(raw): Path<String>,
) -> Result<Accepted, ApiFailure> {
    let id = parse_drop_id(&raw)?;
    match bridge.retry(&id) {
        Ok(()) => Ok(accepted(&id)),
        Err(RestartError::NotFound) => Err(ApiFailure::drop_not_found(&raw)),
        Err(RestartError::NotRetryable) => Err(ApiFailure::drop_not_retryable(&raw)),
    }
}
