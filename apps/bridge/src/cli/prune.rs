use std::path::PathBuf;
use std::process::ExitCode;

pub async fn run(_config: Option<PathBuf>) -> ExitCode {
    eprintln!("herdrop prune is not available yet");
    ExitCode::FAILURE
}
