use std::process::ExitCode;

use super::paths::StatePaths;
use super::status::notify;
use super::stderr_log;

pub async fn run() -> ExitCode {
    stderr_log::init();
    let path = StatePaths::from_env().extension_dir();
    println!("{}", path.display());
    notify::show(&format!("Extension folder: {}", path.display())).await;
    ExitCode::SUCCESS
}
