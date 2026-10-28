import type { AgentsResponse, AgentView, MachinesResponse, MachineView } from '@herdrop/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type BridgeClient, BridgeUnreachable } from '../../bridge/client.ts';
import { createAgents } from './use-agents.ts';

const local: MachineView = { key: 'local', label: 'local', local: true };

function agentsResp(refreshing: boolean, panes: string[] = []): AgentsResponse {
  const agents: AgentView[] = panes.map((pane_id) => ({
    pane_id,
    name: pane_id,
    kind: 'claude',
    status: 'idle',
    focused: false,
    folder: 'D:/app',
    folder_kind: 'cwd',
  }));
  return { machine: 'local', agents, refreshed_at: null, refreshing, error: null };
}

class FakeVisibility extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';

  set(next: DocumentVisibilityState) {
    this.visibilityState = next;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function fakeClient(
  machines: () => Promise<MachinesResponse>,
  agents: (machine: string, opts?: { refresh?: boolean }) => Promise<AgentsResponse>,
) {
  const client = {
    machines: vi.fn(machines),
    agents: vi.fn(agents),
  };
  return client as typeof client & BridgeClient;
}

describe('createAgents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('unreachable_bridge_on_load', async () => {
    const client = fakeClient(
      () => Promise.reject(new BridgeUnreachable(new TypeError('fetch failed'))),
      () => Promise.resolve(agentsResp(false)),
    );
    const agents = createAgents({ client });
    await agents.reload();
    expect(agents.bridge()).toBe('unreachable');
    expect(client.agents).not.toHaveBeenCalled();
    agents.dispose();
  });

  it('herdr_missing_still_lists_local', async () => {
    const client = fakeClient(
      () => Promise.resolve({ machines: [local], error: 'herdr not found' }),
      () => Promise.resolve(agentsResp(false)),
    );
    const agents = createAgents({ client });
    await agents.reload();
    expect(agents.bridge()).toBe('ready');
    expect(agents.groups().map((g) => g.machine)).toEqual([local]);
    expect(agents.machinesError()).toBe('herdr not found');
    agents.dispose();
  });

  it('spinner_follows_foreground_loads_but_not_background_ticks', async () => {
    const answers = [true, true, false, true];
    let i = 0;
    const client = fakeClient(
      () => Promise.resolve({ machines: [local], error: null }),
      () => Promise.resolve(agentsResp(answers[i++] ?? false)),
    );
    const agents = createAgents({ client, visibility: new FakeVisibility() });
    const busy = () => agents.groups()[0]?.busy;
    await agents.reload();
    expect(busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(busy()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.agents).toHaveBeenCalledTimes(4);
    expect(busy()).toBe(false);
    agents.dispose();
  });

  it('a_new_agent_appears_on_a_later_tick_without_reload', async () => {
    const answers = [[], [], ['p1']];
    let i = 0;
    const client = fakeClient(
      () => Promise.resolve({ machines: [local], error: null }),
      () => Promise.resolve(agentsResp(false, answers[i++] ?? ['p1'])),
    );
    const agents = createAgents({ client, visibility: new FakeVisibility() });
    const panes = () => agents.groups()[0]?.resp?.agents.map((a) => a.pane_id);
    await agents.reload();
    expect(panes()).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(panes()).toEqual(['p1']);
    expect(client.machines).toHaveBeenCalledTimes(1);
    agents.dispose();
  });

  it('no_tick_while_hidden_and_refetch_when_visible_again', async () => {
    const client = fakeClient(
      () => Promise.resolve({ machines: [local], error: null }),
      () => Promise.resolve(agentsResp(false)),
    );
    const visibility = new FakeVisibility();
    const agents = createAgents({ client, visibility });
    await agents.reload();
    visibility.set('hidden');
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.agents).toHaveBeenCalledTimes(1);
    visibility.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(client.agents).toHaveBeenCalledTimes(2);
    agents.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.agents).toHaveBeenCalledTimes(2);
  });

  it('refresh_requests_a_forced_refresh', async () => {
    const client = fakeClient(
      () => Promise.resolve({ machines: [local], error: null }),
      () => Promise.resolve(agentsResp(false)),
    );
    const agents = createAgents({ client });
    await agents.reload();
    await agents.refresh('local');
    expect(client.agents).toHaveBeenLastCalledWith('local', { refresh: true });
    agents.dispose();
  });
});
