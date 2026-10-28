use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use serde::Deserialize;
use sha2::{Digest, Sha256};
use tempfile::TempDir;

#[derive(Deserialize)]
struct Manifest {
    version: String,
    build: Vec<Build>,
}

#[derive(Deserialize)]
struct Build {
    command: Vec<String>,
    platforms: Vec<String>,
}

const EXTENSION_ASSET: &str = "herdrop-extension.tar.gz";
const PACKAGED_MANIFEST: &str = r#"{"manifest_version":3,"version":"0.1.0"}"#;

struct Platform {
    asset: &'static str,
    installed: &'static str,
}

fn platform() -> Option<Platform> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some(Platform {
            asset: "herdrop-x86_64-pc-windows-msvc.exe",
            installed: "target/release/herdrop.exe",
        }),
        ("linux", "x86_64") => Some(Platform {
            asset: "herdrop-x86_64-unknown-linux-musl",
            installed: "target/release/herdrop",
        }),
        _ => None,
    }
}

fn manifest() -> Manifest {
    toml::from_str(include_str!("../herdr-plugin.toml")).expect("manifest parses")
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn tar_program() -> PathBuf {
    match std::env::var_os("SystemRoot") {
        Some(root) if cfg!(windows) => Path::new(&root).join("System32").join("tar.exe"),
        _ => PathBuf::from("tar"),
    }
}

struct FakeRelease {
    dir: PathBuf,
    base_url: String,
}

impl FakeRelease {
    fn publish(root: &Path, version: &str, asset: &str, binary: &[u8]) -> Self {
        let dir = root.join("release").join(format!("v{version}"));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(asset), binary).unwrap();

        let unpacked = root.join("unpacked");
        std::fs::create_dir_all(unpacked.join("chunks")).unwrap();
        std::fs::write(unpacked.join("manifest.json"), PACKAGED_MANIFEST).unwrap();
        std::fs::write(unpacked.join("chunks").join("background.js"), "bg").unwrap();
        let tarred = Command::new(tar_program())
            .arg("-czf")
            .arg(dir.join(EXTENSION_ASSET))
            .arg("-C")
            .arg(&unpacked)
            .arg(".")
            .status()
            .unwrap();
        assert!(tarred.success());

        let sums: String = [asset, EXTENSION_ASSET]
            .iter()
            .map(|name| {
                let bytes = std::fs::read(dir.join(name)).unwrap();
                format!("{}  {name}\n", sha256_hex(&bytes))
            })
            .collect();
        std::fs::write(dir.join("SHA256SUMS"), sums).unwrap();

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let served = root.join("release");
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                serve_file(stream, &served);
            }
        });
        Self { dir, base_url }
    }
}

fn serve_file(mut stream: TcpStream, root: &Path) {
    let mut request = Vec::new();
    let mut chunk = [0u8; 1024];
    while !request.windows(4).any(|w| w == b"\r\n\r\n") {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => return,
            Ok(read) => request.extend_from_slice(&chunk[..read]),
        }
    }
    let head = String::from_utf8_lossy(&request);
    let path = head
        .split(' ')
        .nth(1)
        .unwrap_or("/")
        .trim_start_matches('/');
    let (status, body) = match std::fs::read(root.join(path)) {
        Ok(body) => ("200 OK", body),
        Err(_) => ("404 Not Found", b"missing".to_vec()),
    };
    let header = format!(
        "HTTP/1.1 {status}\r\ncontent-type: application/octet-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(&body);
}

fn plugin_checkout(root: &Path) -> PathBuf {
    let plugin = root.join("plugin");
    let source = Path::new(env!("CARGO_MANIFEST_DIR"));
    std::fs::create_dir_all(plugin.join("scripts")).unwrap();
    std::fs::copy(
        source.join("herdr-plugin.toml"),
        plugin.join("herdr-plugin.toml"),
    )
    .unwrap();
    for script in ["fetch-release.ps1", "fetch-release.sh"] {
        std::fs::copy(
            source.join("scripts").join(script),
            plugin.join("scripts").join(script),
        )
        .unwrap();
    }
    plugin
}

fn run_build(plugin: &Path, base_url: &str) -> Output {
    let manifest = manifest();
    let build = manifest
        .build
        .iter()
        .find(|build| build.platforms == [std::env::consts::OS])
        .expect("a build entry for this platform");
    Command::new(&build.command[0])
        .args(&build.command[1..])
        .current_dir(plugin)
        .env("HERDROP_RELEASE_BASE", base_url)
        .output()
        .unwrap()
}

fn describe(output: &Output) -> String {
    format!(
        "{}\n{}\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

#[test]
fn build_installs_the_verified_release_and_rejects_a_tampered_one() {
    let Some(platform) = platform() else {
        return;
    };
    let tmp = TempDir::new().unwrap();
    let version = manifest().version;
    let release = FakeRelease::publish(tmp.path(), &version, platform.asset, b"release binary");
    let plugin = plugin_checkout(tmp.path());
    let installed = plugin.join(platform.installed);

    for attempt in ["first", "repeat"] {
        let output = run_build(&plugin, &release.base_url);
        assert!(output.status.success(), "{attempt}: {}", describe(&output));
        assert_eq!(std::fs::read(&installed).unwrap(), b"release binary");
        assert_eq!(
            std::fs::read_to_string(plugin.join("extension").join("manifest.json")).unwrap(),
            PACKAGED_MANIFEST
        );
        assert!(
            plugin
                .join("extension")
                .join("chunks")
                .join("background.js")
                .is_file()
        );
        assert!(!plugin.join("target").join("release-download").exists());
    }

    let sums = release.dir.join("SHA256SUMS");
    let genuine = std::fs::read_to_string(&sums).unwrap();
    let forged = genuine.replace(&sha256_hex(b"release binary"), &sha256_hex(b"forged"));
    assert_ne!(forged, genuine);
    let tampered_asset = (platform.asset, b"tampered binary".as_slice(), genuine);
    let tampered_sums = (platform.asset, b"release binary".as_slice(), forged);
    for (asset, bytes, listed) in [tampered_asset, tampered_sums] {
        std::fs::write(release.dir.join(asset), bytes).unwrap();
        std::fs::write(&sums, listed).unwrap();
        let output = run_build(&plugin, &release.base_url);
        assert!(!output.status.success(), "{}", describe(&output));
        assert!(
            describe(&output).contains("does not match SHA256SUMS"),
            "{}",
            describe(&output)
        );
        assert_eq!(std::fs::read(&installed).unwrap(), b"release binary");
    }
}
