use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Deserialize;

pub const MANIFEST: &str = "manifest.json";
const STAGING: &str = "tmp";
const RETIRED: &str = "old";

#[derive(Deserialize)]
struct ManifestVersion {
    version: String,
    version_name: Option<String>,
}

pub fn parse_version(manifest: &[u8]) -> Option<String> {
    let manifest: ManifestVersion = serde_json::from_slice(manifest).ok()?;
    Some(manifest.version_name.unwrap_or(manifest.version))
}

pub fn version(dir: &Path) -> Option<String> {
    parse_version(&fs::read(dir.join(MANIFEST)).ok()?)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Deployment {
    NoPackage,
    Current(String),
    Installed(String),
}

pub fn deploy(packaged: &Path, deployed: &Path) -> io::Result<Deployment> {
    let Some(packaged_version) = version(packaged) else {
        return Ok(Deployment::NoPackage);
    };
    if let Some(parent) = deployed.parent() {
        fs::create_dir_all(parent)?;
    }
    remove_leftovers(deployed);
    if version(deployed).as_deref() == Some(packaged_version.as_str()) {
        return Ok(Deployment::Current(packaged_version));
    }
    let staging = sibling(deployed, STAGING);
    remove_dir_if_present(&staging)?;
    copy_dir(packaged, &staging)?;
    let retired = sibling(deployed, RETIRED);
    match fs::rename(deployed, &retired) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
        _ => {}
    }
    if let Err(error) = fs::rename(&staging, deployed) {
        let _ = fs::rename(&retired, deployed);
        return Err(error);
    }
    let _ = fs::remove_dir_all(&retired);
    Ok(Deployment::Installed(packaged_version))
}

fn sibling(deployed: &Path, kind: &str) -> PathBuf {
    let mut name = leftover_prefix(deployed, kind);
    name.push(std::process::id().to_string());
    deployed.with_file_name(name)
}

fn leftover_prefix(deployed: &Path, kind: &str) -> OsString {
    let mut name = deployed.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".{kind}-"));
    name
}

fn remove_leftovers(deployed: &Path) {
    let Some(parent) = deployed.parent() else {
        return;
    };
    let Ok(entries) = fs::read_dir(parent) else {
        return;
    };
    let prefixes = [STAGING, RETIRED].map(|kind| leftover_prefix(deployed, kind));
    for entry in entries.flatten() {
        let name = entry.file_name();
        let leftover = prefixes.iter().any(|prefix| {
            name.as_encoded_bytes()
                .starts_with(prefix.as_encoded_bytes())
        });
        if leftover && let Err(error) = fs::remove_dir_all(entry.path()) {
            tracing::warn!(path = %entry.path().display(), %error, "cannot remove a leftover extension folder");
        }
    }
}

fn remove_dir_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_dir_all(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn parse_version_prefers_the_version_name() {
        let rows: [(&str, Option<&str>); 4] = [
            (r#"{"version":"0.2.0"}"#, Some("0.2.0")),
            (
                r#"{"version":"0.2.0","version_name":"0.2.0-rc.1"}"#,
                Some("0.2.0-rc.1"),
            ),
            (r#"{"name":"Herdrop"}"#, None),
            ("not json", None),
        ];
        for (manifest, expected) in rows {
            assert_eq!(
                parse_version(manifest.as_bytes()).as_deref(),
                expected,
                "{manifest}"
            );
        }
    }

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    fn package(root: &Path, version: &str) -> PathBuf {
        let packaged = root.join("plugin").join("extension");
        write(
            &packaged.join(MANIFEST),
            &format!(r#"{{"manifest_version":3,"version":"{version}"}}"#),
        );
        write(&packaged.join("chunks").join("background.js"), version);
        packaged
    }

    fn listing(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn deploy_converges_when_run_twice() {
        let tmp = TempDir::new().unwrap();
        let packaged = package(tmp.path(), "0.2.0");
        let state = tmp.path().join("state");
        let deployed = state.join("extension");

        assert_eq!(
            deploy(&packaged, &deployed).unwrap(),
            Deployment::Installed("0.2.0".into())
        );
        assert_eq!(
            deploy(&packaged, &deployed).unwrap(),
            Deployment::Current("0.2.0".into())
        );
        assert_eq!(version(&deployed).as_deref(), Some("0.2.0"));
        assert_eq!(
            fs::read_to_string(deployed.join("chunks").join("background.js")).unwrap(),
            "0.2.0"
        );
        assert_eq!(listing(&state), ["extension"]);
    }

    #[test]
    fn deploy_recovers_from_a_crashed_run() {
        let tmp = TempDir::new().unwrap();
        let packaged = package(tmp.path(), "0.2.0");
        let state = tmp.path().join("state");
        let deployed = state.join("extension");
        write(
            &deployed.join(MANIFEST),
            r#"{"manifest_version":3,"version":"0.1.0"}"#,
        );
        write(&deployed.join("removed-in-0.2.0.js"), "old");
        write(&state.join("extension.tmp-4242").join(MANIFEST), "{");
        write(&state.join("extension.old-4242").join(MANIFEST), "{");
        write(&state.join("herdrop.pid"), "{}");

        assert_eq!(
            deploy(&packaged, &deployed).unwrap(),
            Deployment::Installed("0.2.0".into())
        );
        assert_eq!(listing(&state), ["extension", "herdrop.pid"]);
        assert_eq!(listing(&deployed), ["chunks", "manifest.json"]);

        fs::remove_dir_all(&deployed).unwrap();
        write(&state.join("extension.tmp-4242").join(MANIFEST), "{");
        assert_eq!(
            deploy(&packaged, &deployed).unwrap(),
            Deployment::Installed("0.2.0".into())
        );
        assert_eq!(listing(&state), ["extension", "herdrop.pid"]);
    }

    #[test]
    fn deploy_without_a_package_leaves_the_state_alone() {
        let tmp = TempDir::new().unwrap();
        let deployed = tmp.path().join("state").join("extension");

        assert_eq!(
            deploy(&tmp.path().join("plugin").join("extension"), &deployed).unwrap(),
            Deployment::NoPackage
        );
        assert!(!tmp.path().join("state").exists());
    }
}
