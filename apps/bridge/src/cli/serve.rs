use std::fs::{File, OpenOptions};
use std::io;
use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::{Arc, Mutex};

use jiff::Timestamp;
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

use crate::adapters::fs_store::FsBundleStore;
use crate::adapters::herdr_cli::HerdrCli;
use crate::adapters::machine_store::MachineBundleStore;
use crate::adapters::ssh_store::SshBundleStore;
use crate::app::bridge::Bridge;
use crate::cli::config::{Config, ConfigError};
use crate::cli::paths::{PathsError, StatePaths, home_dir, packaged_extension_dir, plugin_root};
use crate::domain::retention::RetentionPolicy;
use crate::http::router;
use crate::http::security::SecurityConfig;
use crate::unpacked::{self, Deployment};

mod updater;

use updater::Updater;

const DEFAULT_FILTER: &str = "herdrop=info";
const SSH_PROGRAM: &str = "ssh";

#[derive(Debug, thiserror::Error)]
enum ServeError {
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error(transparent)]
    Paths(#[from] PathsError),
    #[error("cannot bind 127.0.0.1:{port}: {source}")]
    Bind { port: u16, source: io::Error },
    #[error("server stopped: {0}")]
    Server(io::Error),
}

pub async fn run(
    port: Option<u16>,
    config: Option<PathBuf>,
    log_file: Option<PathBuf>,
    no_warm: bool,
) -> ExitCode {
    if let Err(error) = init_logging(log_file.as_deref()) {
        eprintln!("cannot open log file: {error}");
        return ExitCode::FAILURE;
    }
    match serve(port, config.as_deref(), no_warm).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(error = %error, "serve failed");
            ExitCode::FAILURE
        }
    }
}

fn init_logging(log_file: Option<&Path>) -> io::Result<()> {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_FILTER));
    let builder = tracing_subscriber::fmt().with_env_filter(filter);
    match log_file {
        Some(path) => builder
            .with_ansi(false)
            .with_writer(Mutex::new(open_append(path)?))
            .init(),
        None => builder.with_writer(io::stderr).init(),
    }
    Ok(())
}

fn open_append(path: &Path) -> io::Result<File> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    OpenOptions::new().create(true).append(true).open(path)
}

async fn serve(port: Option<u16>, config: Option<&Path>, no_warm: bool) -> Result<(), ServeError> {
    let config = Config::from_env(config)?;
    let port = port.unwrap_or(config.port);
    let home = home_dir()?;
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let listener = TcpListener::bind(address)
        .await
        .map_err(|source| ServeError::Bind { port, source })?;
    let herdr = Arc::new(HerdrCli::from_env());
    let store = MachineBundleStore {
        local: FsBundleStore { home },
        ssh: SshBundleStore::new(SSH_PROGRAM.into()),
    };
    let bridge = Arc::new(Bridge::new(
        Arc::clone(&herdr),
        Arc::new(store),
        herdr,
        RetentionPolicy::from_days(config.retention_days),
        Arc::new(Timestamp::now),
    ));
    if !no_warm {
        let warming = Arc::clone(&bridge);
        tokio::spawn(async move { warming.warm().await });
    }
    if config.auto_update {
        match (plugin_root(), updater::herdr_bin()) {
            (Some(_), Some(herdr)) => {
                let drops = Arc::clone(&bridge);
                Updater {
                    herdr,
                    busy: move || drops.drops.has_running(),
                }
                .spawn();
            }
            _ => tracing::info!("auto-update off: not running as an installed herdr plugin"),
        }
    }
    let state = StatePaths::from_env();
    if let Some(packaged) = packaged_extension_dir() {
        deploy_extension(packaged, state.extension_dir()).await;
    }
    let app = router(
        bridge,
        SecurityConfig::new(port, &config.extension_id),
        state.extension_dir().into(),
    );
    tracing::info!(port, "listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(ServeError::Server)
}

async fn deploy_extension(packaged: PathBuf, deployed: PathBuf) {
    let task = tokio::task::spawn_blocking(move || unpacked::deploy(&packaged, &deployed));
    match task.await {
        Ok(Ok(Deployment::Installed(version))) => {
            tracing::info!(%version, "deployed the extension");
        }
        Ok(Ok(Deployment::Current(_) | Deployment::NoPackage)) => {}
        Ok(Err(error)) => tracing::warn!(%error, "cannot deploy the extension"),
        Err(error) => tracing::warn!(%error, "extension deploy task failed"),
    }
}

async fn shutdown_signal() {
    if tokio::signal::ctrl_c().await.is_err() {
        std::future::pending::<()>().await;
    }
}
