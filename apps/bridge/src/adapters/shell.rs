pub fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub fn remote_command(script: &str) -> String {
    format!("sh -c {}", sh_quote(script))
}

pub fn ssh_args(target: &str, remote_command: &str) -> Vec<String> {
    ["-T", "-o", "BatchMode=yes", target, remote_command]
        .into_iter()
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unquote_one_level(word: &str) -> String {
        word.strip_prefix('\'')
            .and_then(|rest| rest.strip_suffix('\''))
            .expect("single-quoted word")
            .replace("'\\''", "'")
    }

    #[test]
    fn remote_command_unquotes_back_to_the_script() {
        let script = "set -eu; root='/home/dev/it'\\''s here'/.herdrop; printf '%s\\n' '---'";

        let command = remote_command(script);

        assert!(command.starts_with("sh -c '"), "{command}");
        let word = command.strip_prefix("sh -c ").expect("sh -c prefix");
        assert_eq!(unquote_one_level(word), script);
    }
}
