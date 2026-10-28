use std::path::PathBuf;
use std::process::{Command, Stdio};

use herdrop::adapters::shell::{remote_command, sh_quote, ssh_args};
use herdrop::adapters::ssh_store::SshBundleStore;
use herdrop::domain::bundle::Bundle;
use herdrop::domain::folder::EffectiveFolder;
use herdrop::domain::ids::DropId;
use herdrop::domain::retention::RetentionPolicy;
use herdrop::ports::{BundleLocation, BundleStore, Machine, MachineProfile};
use jiff::Timestamp;

const DEFAULT_TARGET: &str = "vps";
const README_BODY: &str = "# Herdrop drop\n\nOne annotation: A1.md (change).\n";
const ANNOTATION_BODY: &str = "# A1 change\n\nfacturación and it's \"quoted\"\n";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn ssh_output(target: &str, script: &str) -> std::process::Output {
    let mut command = Command::new("ssh");
    command
        .args(ssh_args(target, &remote_command(script)))
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.output().expect("run ssh")
}

fn read_remote(target: &str, path: &str) -> Vec<u8> {
    let output = ssh_output(target, &format!("cat {}", sh_quote(path)));
    assert!(
        output.status.success(),
        "cat {path} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    output.stdout
}

struct Cleanup {
    target: String,
    root: String,
}

impl Drop for Cleanup {
    fn drop(&mut self) {
        let output = ssh_output(&self.target, &format!("rm -rf -- {}", sh_quote(&self.root)));
        if !output.status.success() {
            eprintln!(
                "remote cleanup of {} failed: {}",
                self.root,
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}

#[tokio::test]
#[ignore = "opt-in: needs an ssh alias"]
async fn ssh_store_writes_exact_bytes() {
    if std::env::var("HERDROP_IT").as_deref() != Ok("1") {
        eprintln!("skipped: set HERDROP_IT=1");
        return;
    }
    let target = std::env::var("HERDROP_IT_SSH").unwrap_or_else(|_| DEFAULT_TARGET.to_owned());
    let random: String = (0..16).map(|_| fastrand::lowercase()).collect();
    let root = format!("/tmp/herdrop-it-{random}");
    let folder = format!("{root}/it's here");
    let _cleanup = Cleanup {
        target: target.clone(),
        root,
    };

    let location = BundleLocation {
        machine: Machine::Remote(MachineProfile {
            key: "it".parse().expect("machine key"),
            label: "it".to_owned(),
            ssh_target: target.clone(),
        }),
        folder: EffectiveFolder::Path(folder.clone()),
    };
    let bundle = Bundle::new(vec![
        (
            "README.md".parse().expect("bundle name"),
            README_BODY.to_owned(),
        ),
        (
            "A1.md".parse().expect("bundle name"),
            ANNOTATION_BODY.to_owned(),
        ),
    ])
    .expect("bundle");
    let id = DropId::generate(Timestamp::now(), &mut fastrand::Rng::new());

    let store = SshBundleStore::new(PathBuf::from("ssh"));
    let written = store
        .write(
            &location,
            &id,
            &bundle,
            Timestamp::now(),
            &RetentionPolicy::from_days(7),
        )
        .await
        .expect("remote write");

    let dir = format!("{folder}/.herdrop/drop/{}", id.as_str());
    assert_eq!(written.readme, format!("{dir}/README.md"));
    assert_eq!(
        read_remote(&target, &written.readme),
        README_BODY.as_bytes()
    );
    assert_eq!(
        read_remote(&target, &format!("{dir}/A1.md")),
        ANNOTATION_BODY.as_bytes()
    );
}
