use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "herdrop", version)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Subcommand)]
pub enum Command {}

pub mod config;
pub mod paths;
