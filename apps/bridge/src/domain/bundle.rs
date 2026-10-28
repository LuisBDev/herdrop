use std::collections::HashSet;
use std::str::FromStr;

const MAX_FILES: usize = 200;
const README: &str = "README.md";

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct BundleFileName(String);

impl BundleFileName {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for BundleFileName {
    type Err = BundleError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let invalid = || BundleError::InvalidName(s.to_owned());
        if s == README {
            return Ok(Self(s.to_owned()));
        }
        let digits = s
            .strip_prefix('A')
            .and_then(|rest| rest.strip_suffix(".md"))
            .ok_or_else(invalid)?;
        let well_formed = digits.bytes().all(|b| b.is_ascii_digit())
            && !digits.starts_with('0')
            && digits.parse::<u16>().is_ok_and(|n| (1..=999).contains(&n));
        if well_formed {
            Ok(Self(s.to_owned()))
        } else {
            Err(invalid())
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum BundleError {
    #[error("bundle has no README.md")]
    MissingReadme,
    #[error("bundle has no annotation files")]
    NoAnnotations,
    #[error("duplicate bundle file {0}")]
    Duplicate(String),
    #[error("bundle has too many files")]
    TooManyFiles,
    #[error("invalid bundle file name {0}")]
    InvalidName(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bundle {
    files: Vec<(BundleFileName, String)>,
}

impl Bundle {
    pub fn new(files: Vec<(BundleFileName, String)>) -> Result<Self, BundleError> {
        if files.len() > MAX_FILES {
            return Err(BundleError::TooManyFiles);
        }
        let mut seen = HashSet::new();
        for (name, _) in &files {
            if !seen.insert(name.as_str()) {
                return Err(BundleError::Duplicate(name.as_str().to_owned()));
            }
        }
        if !seen.contains(README) {
            return Err(BundleError::MissingReadme);
        }
        if seen.len() == 1 {
            return Err(BundleError::NoAnnotations);
        }
        Ok(Self { files })
    }

    pub fn files(&self) -> &[(BundleFileName, String)] {
        &self.files
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(s: &str) -> BundleFileName {
        s.parse().unwrap()
    }

    #[test]
    fn bundle_names_and_rules() {
        for ok in ["A10.md", "README.md"] {
            assert!(ok.parse::<BundleFileName>().is_ok(), "{ok}");
        }
        for bad in ["A0.md", "A01.md", "../A1.md", "a1.md", "README.MD"] {
            assert!(bad.parse::<BundleFileName>().is_err(), "{bad}");
        }
        assert_eq!(
            Bundle::new(vec![(name("A1.md"), String::new())]),
            Err(BundleError::MissingReadme)
        );
        assert_eq!(
            Bundle::new(vec![(name("README.md"), String::new())]),
            Err(BundleError::NoAnnotations)
        );
        assert!(
            Bundle::new(vec![
                (name("README.md"), String::new()),
                (name("A1.md"), String::new()),
            ])
            .is_ok()
        );
    }
}
