use axum::extract::{Request, State};
use axum::http::header::{HOST, ORIGIN};
use axum::http::{HeaderMap, Method};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::error::{ApiFailure, Rejection};

const NO_ORIGIN: &str = "-";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecurityConfig {
    pub port: u16,
    pub extension_origin: String,
}

impl SecurityConfig {
    pub fn new(port: u16, extension_id: &str) -> Self {
        Self {
            port,
            extension_origin: format!("chrome-extension://{extension_id}"),
        }
    }

    fn check(&self, method: &Method, headers: &HeaderMap) -> Result<(), ApiFailure> {
        let host = headers.get(HOST).and_then(|value| value.to_str().ok());
        let host_allowed = host.is_some_and(|host| {
            host == format!("127.0.0.1:{}", self.port) || host == format!("localhost:{}", self.port)
        });
        if !host_allowed {
            return Err(ApiFailure::forbidden_host());
        }
        match headers.get(ORIGIN) {
            Some(origin) if origin.as_bytes() != self.extension_origin.as_bytes() => {
                Err(ApiFailure::forbidden_origin())
            }
            None if method == Method::POST => Err(ApiFailure::forbidden_origin()),
            _ => Ok(()),
        }
    }
}

pub async fn guard(
    State(security): State<SecurityConfig>,
    request: Request,
    next: Next,
) -> Response {
    let method = request.method().clone();
    let origin = request.headers().get(ORIGIN).cloned();
    let response = match security.check(&method, request.headers()) {
        Ok(()) => next.run(request).await,
        Err(failure) => failure.into_response(),
    };
    if let Some(Rejection(code)) = response.extensions().get::<Rejection>() {
        let origin = origin.as_ref().map_or_else(
            || NO_ORIGIN.into(),
            |value| String::from_utf8_lossy(value.as_bytes()),
        );
        tracing::info!(code = %code, method = %method, origin = %origin, "rejected");
    }
    response
}
