use std::collections::HashSet;

use serde::Deserialize;

#[derive(Deserialize)]
struct Manifest {
    version: String,
    startup: Vec<Entry>,
    actions: Vec<Action>,
}

#[derive(Deserialize)]
struct Entry {
    command: Vec<String>,
    platforms: Vec<String>,
}

#[derive(Deserialize)]
struct Action {
    id: String,
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

    assert_eq!(manifest.version, env!("CARGO_PKG_VERSION"));

    let mut seen = HashSet::new();
    for action in &manifest.actions {
        assert!(
            seen.insert(action.id.clone()),
            "duplicate action id {}",
            action.id
        );
    }

    for entry in &manifest.startup {
        assert_eq!(entry.command[0], expected_binary(&entry.platforms));
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
