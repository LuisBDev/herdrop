import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AgentsResponse,
  type AgentView,
  decodeAgents,
  type MachineView,
} from '@herdrop/protocol';
import { describe, expect, it } from 'vitest';
import { machineError, machineName, metaText, preselect, toDestination } from './agents-view.ts';

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/protocol/fixtures',
);

function fixture(name: string): AgentsResponse {
  return decodeAgents(JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')));
}

const local: MachineView = { key: 'local', label: 'local', local: true };
const build: MachineView = {
  key: '779f8353534145c8951edca5f0dd34cd',
  label: 'Build machine',
  local: false,
};

function agent(paneId: string, focused: boolean): AgentView {
  return {
    pane_id: paneId,
    name: paneId,
    kind: 'claude',
    status: 'idle',
    focused,
    folder: 'D:/app',
    folder_kind: 'cwd',
  };
}

function resp(
  machine: string,
  agents: AgentView[],
  over: Partial<AgentsResponse> = {},
): AgentsResponse {
  return { machine, agents, refreshed_at: null, refreshing: false, error: null, ...over };
}

describe('agents view model', () => {
  it('meta_text_thresholds', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    const ago = (s: number) =>
      resp('k', [], { refreshed_at: new Date(now - s * 1000).toISOString() });
    const cases: [AgentsResponse | null, boolean, string][] = [
      [ago(2), false, 'Updated just now'],
      [ago(42), false, 'Updated 42 s ago'],
      [ago(180), false, 'Updated 3 min ago'],
      [resp('k', [], { refreshing: true }), false, 'Refreshing…'],
      [ago(2), true, ''],
    ];
    for (const [r, isLocal, expected] of cases) expect(metaText(r, isLocal, now)).toBe(expected);
  });

  it('machine_error_rows', () => {
    const vps: MachineView = { ...build, label: 'vps' };
    expect(machineError(local, 'herdr not found', null)).toBe('Herdr not found');
    expect(machineError(local, null, resp('local', [], { error: 'boom' }))).toBe('Herdr error');
    expect(machineError(vps, null, fixture('agents-remote-error.json'))).toBe(
      "Can't reach vps over SSH",
    );
    expect(machineError(local, null, null, true)).toBe('Herdr error');
    expect(machineError(vps, null, resp(vps.key, []), true)).toBe("Can't reach vps over SSH");
  });

  it('preselect_keeps_current_else_first_focused_local', () => {
    const groups = [
      { machine: local, resp: resp('local', [agent('a1', false), agent('a2', true)]) },
      { machine: build, resp: resp(build.key, [agent('b1', true)]) },
    ];
    expect(preselect(groups, null)).toEqual({ machineKey: 'local', paneId: 'a2' });
    const kept = { machineKey: build.key, paneId: 'b1' };
    expect(preselect(groups, kept)).toEqual(kept);
    expect(preselect(groups, { machineKey: build.key, paneId: 'gone' })).toEqual({
      machineKey: 'local',
      paneId: 'a2',
    });
  });

  it('destination_carries_key_and_label', () => {
    const a = agent('p1', false);
    expect(toDestination(build, a)).toMatchObject({
      machine: build.key,
      machineLabel: 'Build machine',
      local: false,
      paneId: 'p1',
    });
    expect(toDestination(local, a)).toMatchObject({
      machine: 'local',
      machineLabel: 'This PC',
      local: true,
    });
    expect(machineName(local)).toBe('This PC');
  });
});
