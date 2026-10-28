import type { AgentStatus, AgentsResponse, AgentView, MachineView } from '@herdrop/protocol';
import type { Destination } from '../../draft/model.ts';

export type Pick = { machineKey: string; paneId: string };

export type StatusIcon =
  | 'CircleDot'
  | 'Activity'
  | 'CircleAlert'
  | 'CircleCheck'
  | 'CircleQuestionMark';

export type StatusView = { cls: string; icon: StatusIcon; text: AgentStatus };

const STATUS_STYLE: Record<AgentStatus, { cls: string; icon: StatusIcon }> = {
  idle: { cls: 'text-semantic-success', icon: 'CircleDot' },
  working: { cls: 'text-status-working', icon: 'Activity' },
  blocked: { cls: 'text-semantic-warning', icon: 'CircleAlert' },
  done: { cls: 'text-ink-muted', icon: 'CircleCheck' },
  unknown: { cls: 'text-ink-subtle', icon: 'CircleQuestionMark' },
};

export function machineName(m: MachineView): string {
  return m.local ? 'This PC' : m.label;
}

export function metaText(resp: AgentsResponse | null, local: boolean, now: number): string {
  if (local || !resp || resp.error) return '';
  if (resp.refreshing) return 'Refreshing…';
  if (resp.refreshed_at === null) return '';
  const seconds = Math.max(0, Math.floor((now - Date.parse(resp.refreshed_at)) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds} s ago`;
  return `Updated ${Math.floor(seconds / 60)} min ago`;
}

export function machineError(
  m: MachineView,
  machinesError: string | null,
  resp: AgentsResponse | null,
  failed = false,
): string | null {
  if (m.local) {
    const error = resp?.error ?? machinesError;
    if (error === 'herdr not found') return 'Herdr not found';
    return error || failed ? 'Herdr error' : null;
  }
  return resp?.error || failed ? `Can't reach ${m.label} over SSH` : null;
}

export function statusView(status: AgentStatus): StatusView {
  return { ...STATUS_STYLE[status], text: status };
}

export function kindLabel(kind: string | null): string {
  return kind ?? 'unknown';
}

export function preselect(
  groups: { machine: MachineView; resp: AgentsResponse | null }[],
  current: Pick | null,
): Pick | null {
  const picks = groups.flatMap(({ machine, resp }) =>
    (resp?.agents ?? []).map((agent) => ({
      pick: { machineKey: machine.key, paneId: agent.pane_id },
      focused: agent.focused,
    })),
  );
  const kept = current
    ? picks.find(
        ({ pick }) => pick.machineKey === current.machineKey && pick.paneId === current.paneId,
      )
    : undefined;
  if (kept) return kept.pick;
  return picks.find(({ focused }) => focused)?.pick ?? null;
}

export function toDestination(machine: MachineView, agent: AgentView): Destination {
  return {
    machine: machine.key,
    machineLabel: machineName(machine),
    local: machine.local,
    paneId: agent.pane_id,
    name: agent.name,
    kind: agent.kind,
    folder: agent.folder,
    folderKind: agent.folder_kind,
    status: agent.status,
  };
}
