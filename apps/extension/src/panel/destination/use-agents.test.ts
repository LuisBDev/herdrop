import type { AgentsResponse, MachinesResponse, MachineView } from '@herdrop/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type BridgeClient, BridgeUnreachable } from '../../bridge/client.ts';
import { createAgents } from './use-agents.ts';

const local: MachineView = { key: 'local', label: 'local', local: true };

function agentsResp(refreshing: boolean): AgentsResponse {
  return { machine: 'local', agents: [], refreshed_at: null, refreshing, error: null };
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

  it('polling_stops_on_false_or_after_30_refreshing_responses', async () => {
    const cases: { answers: boolean[]; calls: number }[] = [
      { answers: [true, true, false], calls: 3 },
      { answers: Array(60).fill(true), calls: 30 },
    ];
    for (const { answers, calls } of cases) {
      let i = 0;
      const client = fakeClient(
        () => Promise.resolve({ machines: [local], error: null }),
        () => Promise.resolve(agentsResp(answers[i++] ?? false)),
      );
      const agents = createAgents({ client });
      await agents.reload();
      expect(client.agents).toHaveBeenCalledTimes(1);
      for (let n = 2; n <= calls; n++) {
        await vi.advanceTimersByTimeAsync(1999);
        expect(client.agents).toHaveBeenCalledTimes(n - 1);
        await vi.advanceTimersByTimeAsync(1);
        expect(client.agents).toHaveBeenCalledTimes(n);
      }
      await vi.advanceTimersByTimeAsync(20000);
      expect(client.agents).toHaveBeenCalledTimes(calls);
      expect(agents.groups()[0]?.polling).toBe(false);
      agents.dispose();
    }
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
