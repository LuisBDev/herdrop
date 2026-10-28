pub(crate) fn init() {
    let _ = tracing_subscriber::fmt()
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .try_init();
}
