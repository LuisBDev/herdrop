use std::path::Path;

use serde::Deserialize;

pub const MANIFEST: &str = "manifest.json";

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
    parse_version(&std::fs::read(dir.join(MANIFEST)).ok()?)
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
