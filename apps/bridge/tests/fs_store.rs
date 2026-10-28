use std::path::Path;

use herdrop::adapters::fs_store::FsBundleStore;
use herdrop::domain::bundle::Bundle;
use herdrop::domain::folder::EffectiveFolder;
use herdrop::domain::ids::DropId;
use herdrop::domain::retention::RetentionPolicy;
use herdrop::ports::{BundleLocation, BundleStore, Machine};
use jiff::Timestamp;
use tempfile::TempDir;

const NOW: &str = "2026-10-27T12:00:00Z";
const NEW_ID: &str = "20261027-120000-neww";

fn bundle() -> Bundle {
    Bundle::new(vec![
        ("README.md".parse().unwrap(), "# Drop\n".to_owned()),
        ("A1.md".parse().unwrap(), "fix the header\n".to_owned()),
    ])
    .unwrap()
}

fn local(folder: EffectiveFolder) -> BundleLocation {
    BundleLocation {
        machine: Machine::Local,
        folder,
    }
}

fn path_folder(path: &Path) -> EffectiveFolder {
    EffectiveFolder::Path(path.display().to_string())
}

fn entries(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

async fn write(
    store: &FsBundleStore,
    folder: EffectiveFolder,
    id: &str,
) -> herdrop::ports::WrittenBundle {
    store
        .write(
            &local(folder),
            &id.parse::<DropId>().unwrap(),
            &bundle(),
            NOW.parse::<Timestamp>().unwrap(),
            &RetentionPolicy::from_days(7),
        )
        .await
        .unwrap()
}

#[tokio::test]
async fn writes_bundle_atomically_under_cwd() {
    let tmp = TempDir::new().unwrap();
    let folder = tmp.path().join("Mis Proyectos").join("facturación");
    let other = tmp.path().join("other");
    std::fs::create_dir_all(other.join(".herdrop")).unwrap();
    std::fs::write(other.join(".herdrop").join(".gitignore"), "custom\n").unwrap();
    let store = FsBundleStore {
        home: tmp.path().join("home"),
    };

    let written = write(&store, path_folder(&folder), NEW_ID).await;
    write(&store, path_folder(&other), NEW_ID).await;

    let root = folder.join(".herdrop");
    let dir = root.join("drop").join(NEW_ID);
    assert_eq!(
        std::fs::read_to_string(dir.join("README.md")).unwrap(),
        "# Drop\n"
    );
    assert_eq!(
        std::fs::read_to_string(dir.join("A1.md")).unwrap(),
        "fix the header\n"
    );
    assert_eq!(entries(&root.join("drop")), [NEW_ID]);
    assert_eq!(
        std::fs::read_to_string(root.join(".gitignore")).unwrap(),
        "*\n"
    );
    assert_eq!(written.dir, dir.display().to_string());
    assert!(written.readme.ends_with("README.md"));
    assert!(written.readme.starts_with(&folder.display().to_string()));
    assert_eq!(
        std::fs::read_to_string(other.join(".herdrop").join(".gitignore")).unwrap(),
        "custom\n"
    );
}

#[tokio::test]
async fn home_fallback_writes_under_home_herdrop_drop() {
    let tmp = TempDir::new().unwrap();
    let home = tmp.path().join("home");
    let store = FsBundleStore { home: home.clone() };

    let written = write(&store, EffectiveFolder::Home, NEW_ID).await;

    let dir = home.join(".herdrop").join("drop").join(NEW_ID);
    assert_eq!(written.readme, dir.join("README.md").display().to_string());
    assert!(dir.join("A1.md").is_file());
    assert_eq!(
        std::fs::read_to_string(home.join(".herdrop").join(".gitignore")).unwrap(),
        "*\n"
    );
}

#[tokio::test]
async fn write_prunes_old_bundles_and_stale_tmp_but_keeps_new() {
    let tmp = TempDir::new().unwrap();
    let folder = tmp.path().join("project");
    let drop = folder.join(".herdrop").join("drop");
    for name in [
        "20261019-120000-oldd",
        ".tmp-20261027-100000-tmpp",
        "20261026-120000-frsh",
        "keep-me",
    ] {
        std::fs::create_dir_all(drop.join(name)).unwrap();
        std::fs::write(drop.join(name).join("README.md"), "x").unwrap();
    }
    let store = FsBundleStore {
        home: tmp.path().join("home"),
    };

    write(&store, path_folder(&folder), NEW_ID).await;

    assert_eq!(entries(&drop), ["20261026-120000-frsh", NEW_ID, "keep-me"]);
}

#[tokio::test]
async fn write_succeeds_over_a_stale_staging_folder_for_the_same_id() {
    let tmp = TempDir::new().unwrap();
    let folder = tmp.path().join("project");
    let staging = folder
        .join(".herdrop")
        .join("drop")
        .join(format!(".tmp-{NEW_ID}"));
    std::fs::create_dir_all(&staging).unwrap();
    std::fs::write(staging.join("A1.md"), "partial").unwrap();
    let store = FsBundleStore {
        home: tmp.path().join("home"),
    };

    let written = write(&store, path_folder(&folder), NEW_ID).await;

    let dir = Path::new(&written.dir);
    assert_eq!(entries(dir), ["A1.md", "README.md"]);
    assert_eq!(
        std::fs::read_to_string(dir.join("A1.md")).unwrap(),
        "fix the header\n"
    );
    assert_eq!(entries(&folder.join(".herdrop").join("drop")), [NEW_ID]);
}
