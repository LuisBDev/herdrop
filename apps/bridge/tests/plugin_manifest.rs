use std::collections::HashSet;
use std::path::Path;

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
    build: Vec<Entry>,
    startup: Vec<Entry>,
    actions: Vec<Action>,
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

struct ReleaseTarget {
    platform: &'static str,
    script: &'static str,
    asset: &'static str,
    triple: &'static str,
    binary: &'static str,
    binary_in_script: &'static [&'static str],
}

const TARGETS: [ReleaseTarget; 2] = [
    ReleaseTarget {
        platform: "windows",
        script: "scripts/fetch-release.ps1",
        asset: "herdrop-x86_64-pc-windows-msvc.exe",
        triple: "x86_64-pc-windows-msvc",
        binary: r".\target\release\herdrop.exe",
        binary_in_script: &[r"'target\release'", "'herdrop.exe'"],
    },
    ReleaseTarget {
        platform: "linux",
        script: "scripts/fetch-release.sh",
        asset: "herdrop-x86_64-unknown-linux-musl",
        triple: "x86_64-unknown-linux-musl",
        binary: "target/release/herdrop",
        binary_in_script: &["/target/release/herdrop\""],
    },
];

const RELEASE_ASSETS: [&str; 2] = ["herdrop-extension.tar.gz", "SHA256SUMS"];

fn manifest() -> Manifest {
    toml::from_str(include_str!("../herdr-plugin.toml")).expect("manifest parses")
}

fn read(relative: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(relative);
    std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

fn target(platforms: &[String]) -> &'static ReleaseTarget {
    let [platform] = platforms else {
        panic!("entry runs on {platforms:?}; give each platform its own entry");
    };
    TARGETS
        .iter()
        .find(|target| target.platform == platform)
        .unwrap_or_else(|| panic!("no release target for {platform}"))
}

#[test]
fn manifest_identity_matches_the_crate() {
    let manifest = manifest();
    assert_eq!(manifest.id, "herdrop");
    assert_eq!(manifest.version, env!("CARGO_PKG_VERSION"));
    assert_eq!(manifest.min_herdr_version, "0.9.5");
    let declared: HashSet<&str> = manifest.platforms.iter().map(String::as_str).collect();
    let released: HashSet<&str> = TARGETS.iter().map(|target| target.platform).collect();
    assert_eq!(declared, released);
}

#[test]
fn every_platform_builds_by_fetching_its_release_assets() {
    let manifest = manifest();
    for target in &TARGETS {
        let builds: Vec<&Entry> = manifest
            .build
            .iter()
            .filter(|build| build.platforms == [target.platform])
            .collect();
        let [build] = builds.as_slice() else {
            panic!("{} needs exactly one build entry", target.platform);
        };
        assert_eq!(
            build.command.last().map(String::as_str),
            Some(target.script)
        );
        let script = read(target.script);
        for asset in RELEASE_ASSETS.iter().chain([&target.asset]) {
            assert!(
                script.contains(asset),
                "{} never names {asset}",
                target.script
            );
        }
        for fragment in target.binary_in_script {
            assert!(
                script.contains(fragment),
                "{} does not write {}",
                target.script,
                target.binary
            );
        }
    }
    for build in &manifest.build {
        target(&build.platforms);
    }
}

#[test]
fn the_release_workflow_publishes_every_asset_the_scripts_fetch() {
    let workflow = read("../../.github/workflows/release.yml");
    for target in &TARGETS {
        assert!(
            workflow.contains(&format!("target: {}", target.triple)),
            "release.yml does not build {}",
            target.triple
        );
        let suffix = if target.asset.ends_with(".exe") {
            ".exe"
        } else {
            ""
        };
        assert_eq!(target.asset, format!("herdrop-{}{suffix}", target.triple));
    }
    assert!(workflow.contains("herdrop-${{ matrix.target }}${{ matrix.exe }}"));
    for asset in RELEASE_ASSETS {
        assert!(workflow.contains(asset), "release.yml never names {asset}");
    }
}

#[test]
fn startup_and_actions_run_the_binary_the_build_fetched() {
    let manifest = manifest();
    let startup_platforms: HashSet<&str> = manifest
        .startup
        .iter()
        .map(|entry| {
            assert_eq!(entry.command[0], target(&entry.platforms).binary);
            assert_eq!(entry.command[1..], ["start"]);
            entry.platforms[0].as_str()
        })
        .collect();
    assert_eq!(startup_platforms.len(), TARGETS.len());

    let mut seen = HashSet::new();
    for action in &manifest.actions {
        assert!(
            seen.insert(action.id.as_str()),
            "duplicate action id {}",
            action.id
        );
        assert_eq!(
            action.command[0],
            target(&action.platforms).binary,
            "{}",
            action.id
        );
        let verb = action.id.strip_suffix("-windows").unwrap_or(&action.id);
        assert_eq!(action.command[1..], [verb], "{}", action.id);
        let windows_id = action.id.ends_with("-windows");
        assert_eq!(action.platforms == ["windows"], windows_id, "{}", action.id);
        let contexts = if verb == "prune" { "pane" } else { "global" };
        assert_eq!(action.contexts, [contexts], "{}", action.id);
    }
    let expected: HashSet<&str> = [
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
    assert_eq!(seen, expected);
}
