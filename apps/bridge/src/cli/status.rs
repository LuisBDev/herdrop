use std::path::PathBuf;
use std::process::ExitCode;

use super::config::Config;
use super::probe;

pub(super) mod notify;

pub async fn run(port: Option<u16>, config: Option<PathBuf>) -> ExitCode {
    let port = match port {
        Some(port) => port,
        None => match Config::from_env(config.as_deref()) {
            Ok(config) => config.port,
            Err(error) => {
                eprintln!("{error}");
                return ExitCode::FAILURE;
            }
        },
    };
    let text = if probe::health(port).await {
        format!(
            "Bridge running on 127.0.0.1:{port}, v{}",
            env!("CARGO_PKG_VERSION")
        )
    } else {
        "Bridge not running".to_owned()
    };
    println!("{text}");
    notify::show(&text).await;
    ExitCode::SUCCESS
}
