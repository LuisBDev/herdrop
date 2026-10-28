use crate::protocol::FolderKind;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EffectiveFolder {
    Path(String),
    Home,
}

impl EffectiveFolder {
    pub fn resolve(cwd: Option<&str>, foreground_cwd: Option<&str>) -> (Self, FolderKind) {
        let present = |value: Option<&str>| value.filter(|v| !v.is_empty()).map(str::to_owned);
        if let Some(path) = present(cwd) {
            (Self::Path(path), FolderKind::Cwd)
        } else if let Some(path) = present(foreground_cwd) {
            (Self::Path(path), FolderKind::ForegroundCwd)
        } else {
            (Self::Home, FolderKind::Home)
        }
    }

    pub fn display(&self) -> String {
        match self {
            Self::Path(path) => path.clone(),
            Self::Home => "~/.herdrop".to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_prefers_cwd_then_foreground_then_home() {
        let rows = [
            (
                Some("/a"),
                Some("/b"),
                EffectiveFolder::Path("/a".into()),
                FolderKind::Cwd,
            ),
            (
                Some(""),
                Some("/b"),
                EffectiveFolder::Path("/b".into()),
                FolderKind::ForegroundCwd,
            ),
            (None, Some(""), EffectiveFolder::Home, FolderKind::Home),
        ];
        for (cwd, foreground, folder, kind) in rows {
            let (resolved, resolved_kind) = EffectiveFolder::resolve(cwd, foreground);
            assert_eq!(resolved, folder);
            assert_eq!(resolved_kind, kind);
        }
        assert_eq!(EffectiveFolder::Home.display(), "~/.herdrop");
    }
}
