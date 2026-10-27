use std::path::PathBuf;
use std::process::ExitCode;

pub async fn run(_port: Option<u16>, _config: Option<PathBuf>, _no_warm: bool) -> ExitCode {
    eprintln!("herdrop start is not available yet");
    ExitCode::FAILURE
}
