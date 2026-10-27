use std::ffi::OsStr;
use std::process::Stdio;

use tokio::process::Command;

#[cfg(windows)]
pub(crate) const NO_WINDOW: u32 = windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
#[cfg(not(windows))]
pub(crate) const NO_WINDOW: u32 = 0;

pub(crate) fn background(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    command
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(NO_WINDOW);
    command
}
