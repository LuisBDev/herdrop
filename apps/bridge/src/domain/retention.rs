use jiff::{SignedDuration, Timestamp};

use super::ids::DropId;

const TMP_PREFIX: &str = ".tmp-";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetentionPolicy {
    pub bundle_max_age: SignedDuration,
    pub tmp_max_age: SignedDuration,
}

impl RetentionPolicy {
    pub fn from_days(days: u32) -> Self {
        Self {
            bundle_max_age: SignedDuration::from_hours(i64::from(days) * 24),
            tmp_max_age: SignedDuration::from_hours(1),
        }
    }
}

pub fn prune_candidates<'a>(
    names: impl IntoIterator<Item = &'a str>,
    keep: &DropId,
    now: Timestamp,
    policy: &RetentionPolicy,
) -> Vec<String> {
    names
        .into_iter()
        .filter(|name| {
            let (id, max_age) = match name.strip_prefix(TMP_PREFIX) {
                Some(rest) => (rest, policy.tmp_max_age),
                None => (*name, policy.bundle_max_age),
            };
            if *name == keep.as_str() {
                return false;
            }
            id.parse::<DropId>()
                .is_ok_and(|id| now.duration_since(id.timestamp()) > max_age)
        })
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prune_candidates_selects_old_bundles_and_stale_tmp() {
        let now: Timestamp = "2026-10-27T12:00:00Z".parse().unwrap();
        let policy = RetentionPolicy::from_days(7);
        let keep: DropId = "20261019-115959-keep".parse().unwrap();
        let names = [
            "20261019-115959-aaaa",
            "20261020-120001-bbbb",
            ".tmp-20261027-105959-cccc",
            ".tmp-20261027-110001-dddd",
            "notes",
            "20261019-000000-AAAA",
            ".gitignore",
            "20261019-115959-keep",
        ];

        let doomed = prune_candidates(names, &keep, now, &policy);

        assert_eq!(
            doomed,
            ["20261019-115959-aaaa", ".tmp-20261027-105959-cccc"]
        );
    }
}
