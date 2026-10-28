#![allow(dead_code)]

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::http::header::{CONTENT_TYPE, HOST, ORIGIN};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use herdrop::adapters::fs_store::FsBundleStore;
use herdrop::app::bridge::{Bridge, Clock};
use herdrop::domain::ids::PaneId;
use herdrop::domain::retention::RetentionPolicy;
use herdrop::extension_id::bundled_extension_id;
use herdrop::http::router;
use herdrop::http::security::SecurityConfig;
use herdrop::ports::{
    AgentDirectory, AgentPrompter, AgentRecord, DirectoryError, Machine, MachineProfile,
    PromptError, PromptOutcome,
};
use http_body_util::BodyExt;
use jiff::{SignedDuration, Timestamp};
use serde_json::Value;
use tower::ServiceExt;

pub const PORT: u16 = 47821;
pub const HOST_HEADER: &str = "127.0.0.1:47821";
pub const START: &str = "2026-10-27T12:00:00Z";

pub type TestBridge = Bridge<FakeDirectory, FsBundleStore, FakePrompter>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FakeError {
    HerdrMissing,
    Command(String),
}

impl FakeError {
    fn directory(&self) -> DirectoryError {
        match self {
            Self::HerdrMissing => DirectoryError::HerdrMissing,
            Self::Command(message) => DirectoryError::Command(message.clone()),
        }
    }
}

pub struct FakeDirectory {
    machines: Mutex<Result<Vec<MachineProfile>, FakeError>>,
    agents: Mutex<HashMap<String, Result<Vec<AgentRecord>, FakeError>>>,
    machine_calls: AtomicUsize,
    agent_calls: Mutex<HashMap<String, usize>>,
    delay: Mutex<Option<Duration>>,
}

impl Default for FakeDirectory {
    fn default() -> Self {
        Self {
            machines: Mutex::new(Ok(Vec::new())),
            agents: Mutex::new(HashMap::new()),
            machine_calls: AtomicUsize::new(0),
            agent_calls: Mutex::new(HashMap::new()),
            delay: Mutex::new(None),
        }
    }
}

impl FakeDirectory {
    pub fn set_machines(&self, machines: Result<Vec<MachineProfile>, FakeError>) {
        *self.machines.lock().unwrap() = machines;
    }

    pub fn set_agents(&self, key: &str, agents: Result<Vec<AgentRecord>, FakeError>) {
        self.agents.lock().unwrap().insert(key.to_owned(), agents);
    }

    pub fn set_delay(&self, delay: Option<Duration>) {
        *self.delay.lock().unwrap() = delay;
    }

    pub fn machine_calls(&self) -> usize {
        self.machine_calls.load(Ordering::SeqCst)
    }

    pub fn agent_calls(&self, key: &str) -> usize {
        self.agent_calls
            .lock()
            .unwrap()
            .get(key)
            .copied()
            .unwrap_or(0)
    }

    async fn pause(&self) {
        let delay = *self.delay.lock().unwrap();
        if let Some(delay) = delay {
            tokio::time::sleep(delay).await;
        }
    }
}

impl AgentDirectory for FakeDirectory {
    async fn machines(&self) -> Result<Vec<MachineProfile>, DirectoryError> {
        self.machine_calls.fetch_add(1, Ordering::SeqCst);
        self.pause().await;
        let machines = self.machines.lock().unwrap().clone();
        machines.map_err(|error| error.directory())
    }

    async fn agents(&self, machine: &Machine) -> Result<Vec<AgentRecord>, DirectoryError> {
        let key = machine.key().as_str().to_owned();
        *self
            .agent_calls
            .lock()
            .unwrap()
            .entry(key.clone())
            .or_default() += 1;
        self.pause().await;
        let agents = self
            .agents
            .lock()
            .unwrap()
            .get(&key)
            .cloned()
            .unwrap_or_else(|| Ok(Vec::new()));
        agents.map_err(|error| error.directory())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PromptCall {
    pub machine: String,
    pub pane: String,
    pub line: String,
}

pub struct FakePrompter {
    outcome: Mutex<Result<PromptOutcome, String>>,
    calls: Mutex<Vec<PromptCall>>,
}

impl Default for FakePrompter {
    fn default() -> Self {
        Self {
            outcome: Mutex::new(Ok(PromptOutcome::Delivered)),
            calls: Mutex::new(Vec::new()),
        }
    }
}

impl FakePrompter {
    pub fn set_outcome(&self, outcome: Result<PromptOutcome, String>) {
        *self.outcome.lock().unwrap() = outcome;
    }

    pub fn calls(&self) -> Vec<PromptCall> {
        self.calls.lock().unwrap().clone()
    }
}

impl AgentPrompter for FakePrompter {
    async fn prompt(
        &self,
        machine: &Machine,
        pane: &PaneId,
        line: &str,
    ) -> Result<PromptOutcome, PromptError> {
        self.calls.lock().unwrap().push(PromptCall {
            machine: machine.key().as_str().to_owned(),
            pane: pane.as_str().to_owned(),
            line: line.to_owned(),
        });
        let outcome = self.outcome.lock().unwrap().clone();
        outcome.map_err(PromptError::Command)
    }
}

#[derive(Clone)]
pub struct ManualClock(Arc<Mutex<Timestamp>>);

impl Default for ManualClock {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(START.parse().unwrap())))
    }
}

impl ManualClock {
    pub fn now(&self) -> Timestamp {
        *self.0.lock().unwrap()
    }

    pub fn advance(&self, by: SignedDuration) {
        let mut now = self.0.lock().unwrap();
        *now = now.checked_add(by).unwrap();
    }

    pub fn clock(&self) -> Clock {
        let time = Arc::clone(&self.0);
        Arc::new(move || *time.lock().unwrap())
    }
}

pub struct Handles {
    pub directory: Arc<FakeDirectory>,
    pub prompter: Arc<FakePrompter>,
    pub clock: ManualClock,
    pub bridge: Arc<TestBridge>,
}

pub fn extension_origin() -> String {
    format!("chrome-extension://{}", bundled_extension_id())
}

pub fn test_bridge(tmp: &Path) -> (Router, Handles) {
    let directory = Arc::new(FakeDirectory::default());
    let prompter = Arc::new(FakePrompter::default());
    let clock = ManualClock::default();
    let store = Arc::new(FsBundleStore {
        home: tmp.join("home"),
    });
    let bridge = Arc::new(Bridge::new(
        Arc::clone(&directory),
        store,
        Arc::clone(&prompter),
        RetentionPolicy::from_days(7),
        clock.clock(),
    ));
    let security = SecurityConfig::new(PORT, &bundled_extension_id());
    let app = router(Arc::clone(&bridge), security, tmp.join("extension").into());
    (
        app,
        Handles {
            directory,
            prompter,
            clock,
            bridge,
        },
    )
}

pub async fn send(app: &Router, request: Request<Body>) -> (StatusCode, HeaderMap, Value) {
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, headers, body)
}

pub async fn get(app: &Router, path: &str) -> (StatusCode, HeaderMap, Value) {
    let request = Request::builder()
        .method(Method::GET)
        .uri(path)
        .header(HOST, HOST_HEADER)
        .body(Body::empty())
        .unwrap();
    send(app, request).await
}

pub async fn post_json(app: &Router, path: &str, body: &Value) -> (StatusCode, HeaderMap, Value) {
    let request = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header(HOST, HOST_HEADER)
        .header(ORIGIN, extension_origin())
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    send(app, request).await
}
