use clap::Parser;
use herdrop::cli::Cli;

fn main() {
    if let Some(command) = Cli::parse().command {
        match command {}
    }
}
