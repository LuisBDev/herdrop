use std::time::Duration;

use crate::process::background;

const LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);
const HERDROP_IMAGES: [&str; 2] = ["herdrop", "herdrop.exe"];

pub(super) async fn image_name(pid: u32) -> Option<String> {
    let mut command = lookup_command(pid);
    let output = match tokio::time::timeout(LOOKUP_TIMEOUT, command.output()).await {
        Ok(Ok(output)) if output.status.success() => output,
        Ok(Ok(output)) => {
            tracing::warn!(pid, status = %output.status, "process lookup exited with failure");
            return None;
        }
        Ok(Err(error)) => {
            tracing::warn!(pid, %error, "process lookup failed");
            return None;
        }
        Err(_) => {
            tracing::warn!(pid, "process lookup timed out");
            return None;
        }
    };
    parse_lookup(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(windows)]
fn lookup_command(pid: u32) -> tokio::process::Command {
    let mut command = background("tasklist");
    command.args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"]);
    command
}

#[cfg(not(windows))]
fn lookup_command(pid: u32) -> tokio::process::Command {
    let mut command = background("ps");
    command.args(["-p", &pid.to_string(), "-o", "comm="]);
    command
}

#[cfg(windows)]
fn parse_lookup(stdout: &str) -> Option<String> {
    parse_tasklist_image(stdout)
}

#[cfg(not(windows))]
fn parse_lookup(stdout: &str) -> Option<String> {
    parse_ps_comm(stdout)
}

#[cfg(any(windows, test))]
fn parse_tasklist_image(stdout: &str) -> Option<String> {
    let line = stdout.lines().find(|line| line.starts_with('"'))?;
    let image = line.strip_prefix('"')?.split('"').next()?;
    (!image.is_empty()).then(|| image.to_owned())
}

#[cfg(any(not(windows), test))]
fn parse_ps_comm(stdout: &str) -> Option<String> {
    let comm = stdout.trim();
    let name = comm.rsplit('/').next().unwrap_or(comm);
    (!name.is_empty()).then(|| name.to_owned())
}

pub(super) fn is_herdrop_image(name: &str) -> bool {
    HERDROP_IMAGES
        .iter()
        .any(|image| name.eq_ignore_ascii_case(image))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_image_parsing_table() {
        let tasklist = [
            (
                "\"herdrop.exe\",\"4242\",\"Console\",\"1\",\"12,345 K\"\r\n",
                Some("herdrop.exe"),
            ),
            (
                "INFO: No tasks are running which match the specified criteria.\r\n",
                None,
            ),
        ];
        for (stdout, expected) in tasklist {
            assert_eq!(
                parse_tasklist_image(stdout).as_deref(),
                expected,
                "{stdout}"
            );
        }

        let ps = [("/usr/local/bin/herdrop\n", Some("herdrop")), ("\n", None)];
        for (stdout, expected) in ps {
            assert_eq!(parse_ps_comm(stdout).as_deref(), expected, "{stdout:?}");
        }

        for (name, expected) in [
            ("HERDROP.EXE", true),
            ("herdrop", true),
            ("herdrop-helper.exe", false),
        ] {
            assert_eq!(is_herdrop_image(name), expected, "{name}");
        }
    }
}
