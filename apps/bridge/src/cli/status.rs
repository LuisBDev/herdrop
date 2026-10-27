use std::path::PathBuf;
use std::process::ExitCode;

pub async fn run(_port: Option<u16>, _config: Option<PathBuf>) -> ExitCode {
    eprintln!("herdrop status is not available yet");
    ExitCode::FAILURE
}
