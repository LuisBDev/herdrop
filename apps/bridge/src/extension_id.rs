use serde::Deserialize;

const ID_LEN: usize = 32;

#[derive(Debug, thiserror::Error)]
pub enum ExtensionIdError {
    #[error("invalid extension json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("extension id must be 32 letters from a to p")]
    Format,
}

#[derive(Deserialize)]
struct ExtensionFixture {
    id: String,
    #[serde(rename = "key")]
    _key: String,
}

pub fn parse_extension_id(json: &str) -> Result<String, ExtensionIdError> {
    let fixture: ExtensionFixture = serde_json::from_str(json)?;
    let valid =
        fixture.id.len() == ID_LEN && fixture.id.bytes().all(|b| (b'a'..=b'p').contains(&b));
    if valid {
        Ok(fixture.id)
    } else {
        Err(ExtensionIdError::Format)
    }
}

pub fn bundled_extension_id() -> String {
    parse_extension_id(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/protocol/fixtures/extension.json"
    )))
    .expect("bundled extension.json is valid")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(id: &str) -> String {
        format!(r#"{{ "id": "{id}", "key": "AAAA", "extra": 1 }}"#)
    }

    #[test]
    fn rejects_ids_that_are_not_32_letters_a_to_p() {
        let valid = "abcdefghijklmnopabcdefghijklmnop";
        let invalid = [
            &valid[..31],
            "abcdefghijklmnopabcdefghijklmnopa",
            "abcdefghijklmnopabcdefghijklmnoq",
            "Abcdefghijklmnopabcdefghijklmnop",
        ];

        for id in invalid {
            assert!(parse_extension_id(&fixture(id)).is_err(), "{id}");
        }
        assert_eq!(parse_extension_id(&fixture(valid)).unwrap(), valid);
    }
}
