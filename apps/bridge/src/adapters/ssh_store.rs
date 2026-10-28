use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use jiff::Timestamp;
use tokio::io::AsyncWriteExt;

use crate::adapters::shell::{remote_command, sh_quote, ssh_args};
use crate::domain::bundle::Bundle;
use crate::domain::folder::EffectiveFolder;
use crate::domain::ids::DropId;
use crate::domain::retention::{RetentionPolicy, prune_candidates};
use crate::ports::{BundleLocation, BundleStore, Machine, StoreError, WrittenBundle};
use crate::process::background;

const RUN_TIMEOUT: Duration = Duration::from_secs(120);
const README: &str = "README.md";
const SEPARATOR: &str = "---";
const FILE_MODE: u32 = 0o644;
const UNSUPPORTED_FOLDER: &str = "unsupported remote folder";
const SSH_MISSING: &str = "ssh not found";
const SSH_TIMED_OUT: &str = "ssh timed out";
const UNEXPECTED_OUTPUT: &str = "unexpected ssh output";
const LOCAL_UNSUPPORTED: &str = "local machine requires the fs store";

pub fn remote_root_expr(folder: &EffectiveFolder) -> Result<String, StoreError> {
    match folder {
        EffectiveFolder::Path(path) if path.chars().any(char::is_control) => {
            Err(StoreError::Ssh(UNSUPPORTED_FOLDER.to_owned()))
        }
        EffectiveFolder::Path(path) => Ok(format!("{}/.herdrop", sh_quote(path))),
        EffectiveFolder::Home => Ok("\"$HOME/.herdrop\"".to_owned()),
    }
}

pub fn write_script(folder: &EffectiveFolder, id: &DropId) -> Result<String, StoreError> {
    let root = remote_root_expr(folder)?;
    Ok([
        "set -eu".to_owned(),
        format!("root={root}"),
        "mkdir -p \"$root/drop\"".to_owned(),
        "[ -f \"$root/.gitignore\" ] || printf '*\\n' > \"$root/.gitignore\"".to_owned(),
        format!("tmp=\"$root/drop/.tmp-{id}\""),
        format!("dest=\"$root/drop/{id}\""),
        "rm -rf \"$tmp\"".to_owned(),
        "mkdir -p \"$tmp\"".to_owned(),
        "tar -xf - -C \"$tmp\"".to_owned(),
        "rm -rf \"$dest\"".to_owned(),
        "mv \"$tmp\" \"$dest\"".to_owned(),
        "cd \"$dest\"".to_owned(),
        "pwd".to_owned(),
        format!("printf '%s\\n' '{SEPARATOR}'"),
        "ls -1A \"$root/drop\"".to_owned(),
    ]
    .join("; "))
}

pub fn remove_script(folder: &EffectiveFolder, names: &[String]) -> Result<String, StoreError> {
    let root = remote_root_expr(folder)?;
    let quoted: Vec<String> = names.iter().map(|name| sh_quote(name)).collect();
    Ok(format!("cd {root}/drop && rm -rf -- {}", quoted.join(" ")))
}

pub fn bundle_tar(bundle: &Bundle) -> Result<Vec<u8>, StoreError> {
    let mut builder = tar::Builder::new(Vec::new());
    for (name, content) in bundle.files() {
        let bytes = content.as_bytes();
        let mut header = tar::Header::new_ustar();
        header.set_entry_type(tar::EntryType::Regular);
        header.set_mode(FILE_MODE);
        header.set_mtime(0);
        header.set_size(bytes.len() as u64);
        builder.append_data(&mut header, name.as_str(), bytes)?;
    }
    Ok(builder.into_inner()?)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct WriteOutput {
    pub bundle: WrittenBundle,
    pub entries: Vec<String>,
}

pub(crate) fn parse_write_output(stdout: &str) -> Result<WriteOutput, StoreError> {
    let unexpected = || StoreError::Ssh(UNEXPECTED_OUTPUT.to_owned());
    let mut lines = stdout.lines();
    let dir = lines
        .next()
        .filter(|line| line.starts_with('/'))
        .ok_or_else(unexpected)?;
    if lines.next() != Some(SEPARATOR) {
        return Err(unexpected());
    }
    Ok(WriteOutput {
        bundle: WrittenBundle {
            dir: dir.to_owned(),
            readme: format!("{dir}/{README}"),
        },
        entries: entry_names(lines),
    })
}

#[derive(Debug, Clone)]
pub struct SshBundleStore {
    pub ssh: PathBuf,
}

impl SshBundleStore {
    pub fn new(ssh: PathBuf) -> Self {
        Self { ssh }
    }

    async fn run(
        &self,
        target: &str,
        script: &str,
        input: Option<Vec<u8>>,
    ) -> Result<String, StoreError> {
        let mut command = background(&self.ssh);
        command.args(ssh_args(target, &remote_command(script)));
        if input.is_some() {
            command.stdin(Stdio::piped());
        }
        let mut child = command.spawn().map_err(|error| match error.kind() {
            ErrorKind::NotFound => StoreError::Ssh(SSH_MISSING.to_owned()),
            _ => StoreError::Io(error),
        })?;
        let writer = match (input, child.stdin.take()) {
            (Some(bytes), Some(mut stdin)) => Some(tokio::spawn(async move {
                stdin.write_all(&bytes).await?;
                stdin.shutdown().await
            })),
            _ => None,
        };
        let output = tokio::time::timeout(RUN_TIMEOUT, child.wait_with_output())
            .await
            .map_err(|_| StoreError::Ssh(SSH_TIMED_OUT.to_owned()))??;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
            return Err(StoreError::Ssh(if stderr.is_empty() {
                format!("ssh exited with {}", output.status)
            } else {
                stderr
            }));
        }
        if let Some(writer) = writer {
            writer.await.map_err(std::io::Error::other)??;
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    fn spawn_remove(&self, target: &str, folder: &EffectiveFolder, id: &DropId, names: &[String]) {
        let script = match remove_script(folder, names) {
            Ok(script) => script,
            Err(error) => {
                tracing::warn!(drop_id = %id, error = ?error, "remote bundle prune failed");
                return;
            }
        };
        let store = self.clone();
        let target = target.to_owned();
        let id = id.clone();
        tokio::spawn(async move {
            if let Err(error) = store.run(&target, &script, None).await {
                tracing::warn!(drop_id = %id, error = ?error, "remote bundle prune failed");
            }
        });
    }
}

fn remote_target(location: &BundleLocation) -> Result<&str, StoreError> {
    match &location.machine {
        Machine::Remote(profile) => Ok(&profile.ssh_target),
        Machine::Local => Err(StoreError::Ssh(LOCAL_UNSUPPORTED.to_owned())),
    }
}

fn entry_names<'a>(lines: impl Iterator<Item = &'a str>) -> Vec<String> {
    lines
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

impl BundleStore for SshBundleStore {
    async fn write(
        &self,
        location: &BundleLocation,
        id: &DropId,
        bundle: &Bundle,
        now: Timestamp,
        policy: &RetentionPolicy,
    ) -> Result<WrittenBundle, StoreError> {
        let target = remote_target(location)?;
        let script = write_script(&location.folder, id)?;
        let tar = bundle_tar(bundle)?;
        let stdout = self.run(target, &script, Some(tar)).await?;
        let output = parse_write_output(&stdout)?;
        let doomed = prune_candidates(output.entries.iter().map(String::as_str), id, now, policy);
        if !doomed.is_empty() {
            self.spawn_remove(target, &location.folder, id, &doomed);
        }
        Ok(output.bundle)
    }
}

#[cfg(test)]
mod tests {
    use std::io::Read;

    use super::*;
    use crate::domain::bundle::BundleFileName;

    fn bundle(annotation: &str) -> Bundle {
        let name = |s: &str| s.parse::<BundleFileName>().expect("valid name");
        Bundle::new(vec![
            (name("README.md"), "# Herdrop\n".to_owned()),
            (name("A1.md"), annotation.to_owned()),
        ])
        .expect("valid bundle")
    }

    fn scripts(folder: &EffectiveFolder) -> Vec<Result<String, StoreError>> {
        let id: DropId = "20261027-153012-kqzm".parse().expect("valid id");
        let names = ["20201019-000000-aaaa".to_owned(), ".tmp-x'y".to_owned()];
        vec![write_script(folder, &id), remove_script(folder, &names)]
    }

    #[test]
    fn scripts_quote_every_path_and_stay_on_one_line() {
        let rows = [
            (
                EffectiveFolder::Path("/home/dev/it's here".to_owned()),
                "'/home/dev/it'\\''s here'/.herdrop",
            ),
            (EffectiveFolder::Home, "\"$HOME/.herdrop\""),
        ];
        for (folder, root) in rows {
            for script in scripts(&folder) {
                let script = script.expect("script builds");
                assert!(script.contains(root), "{script}");
                assert!(!script.contains('\n'), "{script}");
            }
        }
        let names = ["20201019-000000-aaaa".to_owned(), ".tmp-x'y".to_owned()];
        let remove = remove_script(&EffectiveFolder::Home, &names).expect("script builds");
        assert!(
            remove.ends_with("rm -rf -- '20201019-000000-aaaa' '.tmp-x'\\''y'"),
            "{remove}"
        );
        let id: DropId = "20261027-153012-kqzm".parse().expect("valid id");
        let write = write_script(&EffectiveFolder::Home, &id).expect("script builds");
        assert!(
            write.contains("rm -rf \"$tmp\"; mkdir -p \"$tmp\"")
                && write.contains("tar -xf - -C \"$tmp\"; rm -rf \"$dest\"; mv \"$tmp\" \"$dest\""),
            "{write}"
        );
        for script in scripts(&EffectiveFolder::Path("/home/dev/a\nb".to_owned())) {
            assert!(
                matches!(script, Err(StoreError::Ssh(ref message)) if message == "unsupported remote folder"),
                "{script:?}"
            );
        }
    }

    #[test]
    fn tar_contains_only_bundle_names_with_exact_bytes() {
        let source = bundle("Factura: facturación ✓\n");

        let bytes = bundle_tar(&source).expect("tar builds");

        let mut archive = tar::Archive::new(bytes.as_slice());
        let mut found = Vec::new();
        for entry in archive.entries().expect("entries") {
            let mut entry = entry.expect("entry");
            let name = entry.path().expect("path").display().to_string();
            let mut content = String::new();
            entry.read_to_string(&mut content).expect("utf-8 content");
            found.push((name, content));
        }
        let expected: Vec<(String, String)> = source
            .files()
            .iter()
            .map(|(name, content)| (name.as_str().to_owned(), content.clone()))
            .collect();
        assert_eq!(found, expected);
    }

    #[test]
    fn parse_write_output_extracts_dir_and_entries() {
        let stdout = "/home/dev/p/.herdrop/drop/20261027-153012-kqzm\n---\n20261019-115959-aaaa\n20261027-153012-kqzm\n";

        let output = parse_write_output(stdout).expect("parses");

        let dir = "/home/dev/p/.herdrop/drop/20261027-153012-kqzm";
        assert_eq!(
            output,
            WriteOutput {
                bundle: WrittenBundle {
                    dir: dir.to_owned(),
                    readme: format!("{dir}/README.md"),
                },
                entries: vec![
                    "20261019-115959-aaaa".to_owned(),
                    "20261027-153012-kqzm".to_owned(),
                ],
            }
        );
    }
}
