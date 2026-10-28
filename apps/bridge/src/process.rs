use std::ffi::OsStr;
use std::process::Stdio;

use tokio::process::Command;

pub(crate) fn background(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    command
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
    command
}
