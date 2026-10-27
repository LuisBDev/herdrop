use axum::Json;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::protocol::{ApiError, ApiErrorBody};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiFailure {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
}

impl ApiFailure {
    fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    pub fn forbidden_host() -> Self {
        Self::new(StatusCode::FORBIDDEN, "forbidden_host", "host not allowed")
    }

    pub fn forbidden_origin() -> Self {
        Self::new(
            StatusCode::FORBIDDEN,
            "forbidden_origin",
            "origin not allowed",
        )
    }

    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalid_request", message)
    }

    pub fn unknown_machine(key: &str) -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            "unknown_machine",
            format!("unknown machine {key}"),
        )
    }

    pub fn drop_not_found(id: &str) -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            "drop_not_found",
            format!("drop {id} not found"),
        )
    }

    pub fn drop_not_retryable(id: &str) -> Self {
        Self::new(
            StatusCode::CONFLICT,
            "drop_not_retryable",
            format!("drop {id} cannot be retried"),
        )
    }

    pub fn invalid_bundle(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalid_bundle", message)
    }
}

impl From<JsonRejection> for ApiFailure {
    fn from(rejection: JsonRejection) -> Self {
        Self::invalid_request(rejection.body_text())
    }
}

impl IntoResponse for ApiFailure {
    fn into_response(self) -> Response {
        let body = ApiError {
            error: ApiErrorBody {
                code: self.code.to_owned(),
                message: self.message,
            },
        };
        (self.status, Json(body)).into_response()
    }
}
