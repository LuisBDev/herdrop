use std::ffi::OsString;
#[cfg(windows)]
use std::io;
use std::path::Path;
use std::process::{Command, Stdio};

pub(crate) fn command(program: &Path, args: &[OsString], cwd: &Path) -> Command {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    detach(&mut command);
    command
}

#[cfg(unix)]
fn detach(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(windows)]
fn detach(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    use windows_sys::Win32::System::Threading::{
        CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW, DETACHED_PROCESS,
    };
    command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(windows)]
#[allow(unsafe_code)]
pub(crate) fn disable_std_handle_inheritance() -> io::Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::{
        HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE, SetHandleInformation,
    };
    let handles = [
        io::stdin().as_raw_handle(),
        io::stdout().as_raw_handle(),
        io::stderr().as_raw_handle(),
    ];
    let usable = handles
        .into_iter()
        .filter(|handle| !handle.is_null() && *handle != INVALID_HANDLE_VALUE);
    for handle in usable {
        let done = unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0) };
        if done == 0 {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}
