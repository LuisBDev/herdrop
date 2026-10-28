use std::collections::HashSet;

use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(dead_code)]
struct Manifest {
    id: String,
    name: String,
    version: String,
    min_herdr_version: String,
    description: String,
    platforms: Vec<String>,
    build: Vec<Build>,
    startup: Vec<Entry>,
    actions: Vec<Action>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Build {
    command: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    command: Vec<String>,
    platforms: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(dead_code)]
struct Action {
    id: String,
    title: String,
    contexts: Vec<String>,
    platforms: Vec<String>,
    command: Vec<String>,
}

fn expected_binary(platforms: &[String]) -> &'static str {
    if platforms == ["windows"] {
        r".\target\release\herdrop.exe"
    } else {
        "target/release/herdrop"
    }
}

#[test]
fn manifest_actions_are_unique_and_match_their_platform() {
    let text = include_str!("../herdr-plugin.toml");
    let manifest: Manifest = toml::from_str(text).expect("manifest parses");

    assert_eq!(manifest.id, "herdrop");
    assert_eq!(manifest.version, env!("CARGO_PKG_VERSION"));
    assert_eq!(manifest.min_herdr_version, "0.9.5");
    assert_eq!(manifest.platforms, ["linux", "macos", "windows"]);
    assert!(
        manifest.build.iter().any(|build| {
            build.command.iter().any(|arg| arg == "--release")
                && build.command.iter().any(|arg| arg == "--locked")
        }),
        "no release locked build command"
    );

    let mut seen = HashSet::new();
    for action in &manifest.actions {
        assert!(
            seen.insert(action.id.as_str()),
            "duplicate action id {}",
            action.id
        );
    }
    let expected_ids: HashSet<&str> = [
        "start",
        "start-windows",
        "stop",
        "stop-windows",
        "status",
        "status-windows",
        "extension-path",
        "extension-path-windows",
        "prune",
        "prune-windows",
    ]
    .into_iter()
    .collect();
    assert_eq!(seen, expected_ids);

    for entry in &manifest.startup {
        assert_eq!(entry.command[0], expected_binary(&entry.platforms));
        assert_eq!(entry.command.last().map(String::as_str), Some("start"));
    }

    for action in &manifest.actions {
        assert_eq!(
            action.command[0],
            expected_binary(&action.platforms),
            "{}",
            action.id
        );
        let verb = action.id.strip_suffix("-windows").unwrap_or(&action.id);
        assert_eq!(
            action.command.last().map(String::as_str),
            Some(verb),
            "{}",
            action.id
        );
        let windows_id = action.id.ends_with("-windows");
        assert_eq!(action.platforms == ["windows"], windows_id, "{}", action.id);
        if !action.id.starts_with("prune") {
            assert_eq!(action.contexts, ["global"], "{}", action.id);
        }
    }

    let prune: Vec<_> = manifest
        .actions
        .iter()
        .filter(|a| a.id.starts_with("prune"))
        .collect();
    assert_eq!(prune.len(), 2);
    for action in prune {
        assert_eq!(action.contexts, ["pane"]);
    }
}
