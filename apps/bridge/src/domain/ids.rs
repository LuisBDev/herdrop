use std::fmt;
use std::str::FromStr;

use jiff::Timestamp;
use jiff::civil::DateTime;
use jiff::tz::TimeZone;

const DROP_ID_FORMAT: &str = "%Y%m%d-%H%M%S";
const DROP_ID_LEN: usize = 20;
const MAX_KEY_LEN: usize = 128;
const MAX_ID_LEN: usize = 64;
const LOCAL: &str = "local";

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct DropId(String);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("invalid drop id")]
pub struct DropIdError;

impl DropId {
    pub fn generate(now: Timestamp, rng: &mut fastrand::Rng) -> Self {
        let stamp = now.to_zoned(TimeZone::UTC).strftime(DROP_ID_FORMAT);
        let suffix: String = (0..4).map(|_| rng.lowercase()).collect();
        Self(format!("{stamp}-{suffix}"))
    }

    pub fn timestamp(&self) -> Timestamp {
        parse_prefix(&self.0).unwrap_or(Timestamp::UNIX_EPOCH)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn parse_prefix(s: &str) -> Option<Timestamp> {
    let prefix = s.get(..15)?;
    let civil = DateTime::strptime(DROP_ID_FORMAT, prefix).ok()?;
    civil.to_zoned(TimeZone::UTC).ok().map(|z| z.timestamp())
}

impl FromStr for DropId {
    type Err = DropIdError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let bytes = s.as_bytes();
        let shaped = bytes.len() == DROP_ID_LEN
            && bytes[..8].iter().all(u8::is_ascii_digit)
            && bytes[8] == b'-'
            && bytes[9..15].iter().all(u8::is_ascii_digit)
            && bytes[15] == b'-'
            && bytes[16..].iter().all(u8::is_ascii_lowercase);
        if shaped && parse_prefix(s).is_some() {
            Ok(Self(s.to_owned()))
        } else {
            Err(DropIdError)
        }
    }
}

impl fmt::Display for DropId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("invalid pane id")]
pub struct PaneIdError;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PaneId(String);

impl PaneId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for PaneId {
    type Err = PaneIdError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, ':' | '_' | '.' | '-');
        if (1..=MAX_ID_LEN).contains(&s.len()) && !s.starts_with('-') && s.chars().all(allowed) {
            Ok(Self(s.to_owned()))
        } else {
            Err(PaneIdError)
        }
    }
}

impl fmt::Display for PaneId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum KeyError {
    #[error("machine key is empty")]
    Empty,
    #[error("machine key is longer than 128 characters")]
    TooLong,
    #[error("machine key contains a control character")]
    Control,
    #[error("machine key starts with '-'")]
    LeadingDash,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct MachineKey(String);

impl MachineKey {
    pub fn local() -> Self {
        Self(LOCAL.to_owned())
    }

    pub fn is_local(&self) -> bool {
        self.0 == LOCAL
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for MachineKey {
    type Err = KeyError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let key = s.trim();
        if key.is_empty() {
            return Err(KeyError::Empty);
        }
        if key.chars().count() > MAX_KEY_LEN {
            return Err(KeyError::TooLong);
        }
        if key.chars().any(char::is_control) {
            return Err(KeyError::Control);
        }
        if key.starts_with('-') {
            return Err(KeyError::LeadingDash);
        }
        Ok(Self(key.to_owned()))
    }
}

impl fmt::Display for MachineKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("invalid client request id")]
pub struct ClientRequestIdError;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClientRequestId(String);

impl ClientRequestId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for ClientRequestId {
    type Err = ClientRequestIdError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if (1..=MAX_ID_LEN).contains(&s.len())
            && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            Ok(Self(s.to_owned()))
        } else {
            Err(ClientRequestIdError)
        }
    }
}

impl fmt::Display for ClientRequestId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drop_id_formats_utc_and_parses_back() {
        let now: Timestamp = "2026-10-27T15:30:12Z".parse().unwrap();
        let mut rng = fastrand::Rng::with_seed(7);

        let id = DropId::generate(now, &mut rng);

        assert!(id.as_str().starts_with("20261027-153012-"));
        assert!(id.as_str()[16..].bytes().all(|b| b.is_ascii_lowercase()));
        assert_eq!(id.as_str().parse::<DropId>().unwrap(), id);
        assert_eq!(id.timestamp(), now);
        for bad in ["20261027-153012-KQZM", "20261027-153012-kqz"] {
            assert!(bad.parse::<DropId>().is_err(), "{bad}");
        }
    }

    #[test]
    fn machine_key_parse_table() {
        let long_ok = "a".repeat(128);
        let accepted = [
            ("Build machine", "Build machine"),
            ("vps/work", "vps/work"),
            ("máquina", "máquina"),
            (
                "779f8353534145c8951edca5f0dd34cd",
                "779f8353534145c8951edca5f0dd34cd",
            ),
            (long_ok.as_str(), long_ok.as_str()),
            ("  vps  ", "vps"),
        ];
        for (input, expected) in accepted {
            assert_eq!(input.parse::<MachineKey>().unwrap().as_str(), expected);
        }
        let too_long = "a".repeat(129);
        for bad in ["", "   ", "a\nb", "-oProxyCommand=x", too_long.as_str()] {
            assert!(bad.parse::<MachineKey>().is_err(), "{bad:?}");
        }
    }
}
