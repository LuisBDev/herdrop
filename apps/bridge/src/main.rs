use std::process::ExitCode;

use clap::Parser;
use herdrop::cli::{Cli, Command, prune, serve, start, status, stop};

#[tokio::main]
async fn main() -> ExitCode {
    let Some(command) = Cli::parse().command else {
        return ExitCode::SUCCESS;
    };
    match command {
        Command::Serve {
            port,
            config,
            log_file,
            no_warm,
        } => serve::run(port, config, log_file, no_warm).await,
        Command::Start {
            port,
            config,
            no_warm,
        } => start::run(port, config, no_warm).await,
        Command::Stop => stop::run().await,
        Command::Status { port, config } => status::run(port, config).await,
        Command::Prune { config } => prune::run(config).await,
    }
}
