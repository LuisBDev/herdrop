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
        #[arg(long, value_parser = port_parser())]
        port: Option<u16>,
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long)]
        log_file: Option<PathBuf>,
        #[arg(long)]
        no_warm: bool,
    },
    Start {
        #[arg(long, value_parser = port_parser())]
        port: Option<u16>,
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long)]
        no_warm: bool,
    },
    Stop,
    Status {
        #[arg(long, value_parser = port_parser())]
        port: Option<u16>,
        #[arg(long)]
        config: Option<PathBuf>,
    },
    Prune {
        #[arg(long)]
        config: Option<PathBuf>,
    },
}

fn port_parser() -> clap::builder::RangedI64ValueParser<u16> {
    clap::value_parser!(u16).range(1..)
}

pub mod config;
pub mod paths;
pub mod probe;
pub mod prune;
pub mod serve;
pub mod start;
pub mod status;
mod stderr_log;
pub mod stop;
