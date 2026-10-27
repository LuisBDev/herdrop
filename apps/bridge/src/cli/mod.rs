use std::path::PathBuf;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "herdrop", version)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Subcommand)]
pub enum Command {
    Serve {
        #[arg(long)]
        port: Option<u16>,
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long)]
        log_file: Option<PathBuf>,
        #[arg(long)]
        no_warm: bool,
    },
    Start {
        #[arg(long)]
        port: Option<u16>,
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long)]
        no_warm: bool,
    },
    Stop,
    Status {
        #[arg(long)]
        port: Option<u16>,
        #[arg(long)]
        config: Option<PathBuf>,
    },
    Prune {
        #[arg(long)]
        config: Option<PathBuf>,
    },
}

pub mod config;
pub mod paths;
pub mod probe;
pub mod prune;
pub mod serve;
pub mod start;
pub mod status;
pub mod stop;
