use serde::Deserialize;

use crate::domain::folder::EffectiveFolder;
use crate::domain::ids::{MachineKey, PaneId};
use crate::ports::{AgentRecord, DirectoryError, MachineProfile};
use crate::protocol::AgentStatus;

const DEFAULT_KIND: &str = "Agent";

#[derive(Deserialize)]
struct MachineEntry {
    id: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    target: Option<String>,
    #[serde(default)]
    enabled: bool,
}

#[derive(Deserialize)]
struct AgentListEnvelope {
    result: AgentListResult,
}

#[derive(Deserialize)]
struct AgentListResult {
    agents: Vec<AgentInfo>,
}

#[derive(Deserialize)]
struct AgentInfo {
    pane_id: String,
    #[serde(default)]
    agent: Option<String>,
    #[serde(default)]
    agent_status: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    foreground_cwd: Option<String>,
    #[serde(default)]
    focused: bool,
    #[serde(default)]
    terminal_title_stripped: Option<String>,
}

#[derive(Deserialize)]
struct ErrorEnvelope {
    error: ErrorBody,
}

#[derive(Deserialize)]
struct ErrorBody {
    code: String,
    message: String,
}

pub(crate) fn parse_machine_list(stdout: &str) -> Result<Vec<MachineProfile>, DirectoryError> {
    let entries: Vec<MachineEntry> =
        serde_json::from_str(stdout).map_err(|error| DirectoryError::Parse(error.to_string()))?;
    Ok(entries
        .into_iter()
        .filter(|entry| entry.enabled)
        .filter_map(machine_profile)
        .collect())
}

fn machine_profile(entry: MachineEntry) -> Option<MachineProfile> {
    let target = entry.target.unwrap_or_default();
    let key = match entry.id.parse::<MachineKey>() {
        Ok(key) if !target.is_empty() && !target.starts_with('-') => key,
        _ => {
            tracing::warn!(id = %entry.id, "skipping unsafe herdr machine profile");
            return None;
        }
    };
    let label = entry
        .label
        .as_deref()
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .map_or_else(|| key.as_str().to_owned(), str::to_owned);
    Some(MachineProfile {
        key,
        label,
        ssh_target: target,
    })
}

pub(crate) fn parse_agent_list(stdout: &str) -> Result<Vec<AgentRecord>, DirectoryError> {
    let envelope: AgentListEnvelope =
        serde_json::from_str(stdout).map_err(|error| DirectoryError::Parse(error.to_string()))?;
    Ok(envelope
        .result
        .agents
        .into_iter()
        .filter_map(agent_record)
        .collect())
}

fn agent_record(info: AgentInfo) -> Option<AgentRecord> {
    let Ok(pane_id) = info.pane_id.parse::<PaneId>() else {
        tracing::warn!(pane_id = %info.pane_id, "skipping herdr agent with invalid pane id");
        return None;
    };
    let kind = info.agent.filter(|kind| !kind.trim().is_empty());
    let (folder, folder_kind) =
        EffectiveFolder::resolve(info.cwd.as_deref(), info.foreground_cwd.as_deref());
    let name = agent_name(
        info.terminal_title_stripped.as_deref(),
        kind.as_deref(),
        &folder,
        &pane_id,
    );
    Some(AgentRecord {
        pane_id,
        name,
        kind,
        status: agent_status(info.agent_status.as_deref()),
        focused: info.focused,
        folder,
        folder_kind,
    })
}

fn agent_name(
    title: Option<&str>,
    kind: Option<&str>,
    folder: &EffectiveFolder,
    pane: &PaneId,
) -> String {
    if let Some(title) = title.map(str::trim).filter(|title| !title.is_empty()) {
        return title.to_owned();
    }
    let kind = kind.unwrap_or(DEFAULT_KIND);
    let base = match folder {
        EffectiveFolder::Path(path) => basename(path),
        EffectiveFolder::Home => None,
    };
    match base {
        Some(base) => format!("{kind} in {base}"),
        None => format!("{kind} in pane {pane}"),
    }
}

fn basename(path: &str) -> Option<&str> {
    path.split(['/', '\\'])
        .rev()
        .find(|segment| !segment.is_empty())
        .filter(|segment| !segment.ends_with(':'))
}

fn agent_status(status: Option<&str>) -> AgentStatus {
    match status {
        Some("idle") => AgentStatus::Idle,
        Some("working") => AgentStatus::Working,
        Some("blocked") => AgentStatus::Blocked,
        Some("done") => AgentStatus::Done,
        _ => AgentStatus::Unknown,
    }
}

pub(crate) fn parse_error(stderr: &str) -> Option<(String, String)> {
    let envelope: ErrorEnvelope = serde_json::from_str(stderr.trim()).ok()?;
    Some((envelope.error.code, envelope.error.message))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::FolderKind;

    #[test]
    fn parses_agent_list() {
        let titled = r#"{"id":"cli:agent:list","result":{"agents":[{"agent":"claude","agent_session":{"agent":"claude","kind":"id","source":"herdr:claude","value":"6b5f"},"agent_status":"working","cwd":"D:\\Projects\\herdrop","focused":true,"interactive_ready":true,"name":"orq","pane_id":"w6:pK","revision":5,"state_change_seq":203,"tab_id":"w6:t3","terminal_id":"term_65","terminal_title":"◐ Planificación","terminal_title_stripped":"Planificación de handoff herdrop","workspace_id":"w6"}],"type":"agent_list"}}"#;
        let records = parse_agent_list(titled).unwrap();
        assert_eq!(records.len(), 1);
        let record = &records[0];
        assert_eq!(record.pane_id.as_str(), "w6:pK");
        assert_eq!(record.name, "Planificación de handoff herdrop");
        assert_eq!(record.kind.as_deref(), Some("claude"));
        assert_eq!(record.status, AgentStatus::Working);
        assert!(record.focused);
        assert_eq!(
            record.folder,
            EffectiveFolder::Path("D:\\Projects\\herdrop".to_owned())
        );
        assert_eq!(record.folder_kind, FolderKind::Cwd);

        let empty = r#"{"id":"cli:agent:list","result":{"agents":[],"type":"agent_list"}}"#;
        assert!(parse_agent_list(empty).unwrap().is_empty());

        let untitled = r#"{"id":"cli:agent:list","result":{"agents":[{"agent":"opencode","agent_status":"idle","cwd":"D:\\Projects\\acme","foreground_cwd":null,"focused":false,"pane_id":"w2:p4","terminal_title_stripped":null}],"type":"agent_list"}}"#;
        assert_eq!(
            parse_agent_list(untitled).unwrap()[0].name,
            "opencode in acme"
        );

        let bare = r#"{"id":"cli:agent:list","result":{"agents":[{"agent":null,"agent_status":"unknown","cwd":null,"foreground_cwd":null,"focused":false,"pane_id":"w3:p1","terminal_title_stripped":null}],"type":"agent_list"}}"#;
        let bare = &parse_agent_list(bare).unwrap()[0];
        assert_eq!(bare.name, "Agent in pane w3:p1");
        assert_eq!(bare.status, AgentStatus::Unknown);
        assert_eq!(bare.folder, EffectiveFolder::Home);
    }

    #[test]
    fn parses_machine_list_keeps_enabled_safe_profiles() {
        let stdout = r#"[{"id":"779f8353534145c8951edca5f0dd34cd","label":"Build machine","target":"vps","session":"default","enabled":true,"selected":false},{"id":"aa11bb22cc33dd44ee55ff6600778899","label":"vps/work","target":"vps","session":"work","enabled":true,"selected":false},{"id":"0123456789abcdef0123456789abcdef","label":"old","target":"old","session":"default","enabled":false,"selected":false},{"id":"fedcba9876543210fedcba9876543210","label":"bad","target":"-oProxyCommand=x","session":"default","enabled":true,"selected":false}]"#;

        let profiles = parse_machine_list(stdout).unwrap();

        let summary: Vec<(&str, &str, &str)> = profiles
            .iter()
            .map(|p| (p.key.as_str(), p.label.as_str(), p.ssh_target.as_str()))
            .collect();
        assert_eq!(
            summary,
            [
                ("779f8353534145c8951edca5f0dd34cd", "Build machine", "vps"),
                ("aa11bb22cc33dd44ee55ff6600778899", "vps/work", "vps"),
            ]
        );
        assert!(matches!(
            parse_machine_list("not json"),
            Err(DirectoryError::Parse(_))
        ));
    }
}
