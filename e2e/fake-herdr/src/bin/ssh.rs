use std::io;
use std::process::ExitCode;

use fake_herdr::append_log;

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    append_log("ssh", &argv);
    let _ = io::copy(&mut io::stdin().lock(), &mut io::sink());
    eprintln!("fake ssh: no remote hosts in tests");
    ExitCode::from(255)
}
