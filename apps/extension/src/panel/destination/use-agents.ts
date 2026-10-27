import type { AgentsResponse, MachineView } from '@herdrop/protocol';
import { type Accessor, createSignal } from 'solid-js';
import { type BridgeClient, BridgeUnreachable } from '../../bridge/client.ts';
import { type Pick, preselect } from './agents-view.ts';

const POLL_MS = 2000;
const MAX_REFRESHING = 30;
const TICK_MS = 1000;

type TimerId = ReturnType<typeof setTimeout>;

export type BridgeState = 'loading' | 'ready' | 'unreachable';

export type AgentGroup = { machine: MachineView; resp: AgentsResponse | null; polling: boolean };

export type Agents = {
  bridge: Accessor<BridgeState>;
  groups: Accessor<AgentGroup[]>;
  machinesError: Accessor<string | null>;
  pick: Accessor<Pick | null>;
  choose(p: Pick): void;
  reload(): Promise<void>;
  refresh(machineKey: string): Promise<void>;
  now: Accessor<number>;
  dispose(): void;
};

export function createAgents(deps: {
  client: BridgeClient;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  now?: () => number;
}): Agents {
  const { client } = deps;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  const clock = deps.now ?? Date.now;

  const [bridge, setBridge] = createSignal<BridgeState>('loading');
  const [groups, setGroups] = createSignal<AgentGroup[]>([]);
  const [machinesError, setMachinesError] = createSignal<string | null>(null);
  const [pick, setPick] = createSignal<Pick | null>(null);
  const [now, setNow] = createSignal(clock());

  const pollTimers = new Map<string, TimerId>();
  const refreshingCounts = new Map<string, number>();
  let generation = 0;
  let disposed = false;

  const tick = () => {
    setNow(clock());
    tickTimer = setTimer(tick, TICK_MS);
  };
  let tickTimer: TimerId | undefined = setTimer(tick, TICK_MS);

  function update(key: string, change: Partial<Omit<AgentGroup, 'machine'>>) {
    const next = groups().map((g) => (g.machine.key === key ? { ...g, ...change } : g));
    setGroups(next);
    setPick(preselect(next, pick()));
  }

  function stopPolling(key: string) {
    const timer = pollTimers.get(key);
    if (timer !== undefined) clearTimer(timer);
    pollTimers.delete(key);
  }

  function stopAllPolling() {
    for (const key of [...pollTimers.keys()]) stopPolling(key);
    refreshingCounts.clear();
  }

  async function fetchAgents(key: string, refresh: boolean, gen: number): Promise<void> {
    stopPolling(key);
    update(key, { polling: true });
    let resp: AgentsResponse;
    try {
      resp = refresh ? await client.agents(key, { refresh: true }) : await client.agents(key);
    } catch (error) {
      if (gen !== generation || disposed) return;
      if (error instanceof BridgeUnreachable) setBridge('unreachable');
      refreshingCounts.delete(key);
      update(key, { polling: false });
      return;
    }
    if (gen !== generation || disposed) return;
    const count = resp.refreshing ? (refreshingCounts.get(key) ?? 0) + 1 : 0;
    refreshingCounts.set(key, count);
    const again = resp.refreshing && count < MAX_REFRESHING;
    update(key, { resp, polling: again });
    if (again) {
      pollTimers.set(
        key,
        setTimer(() => {
          pollTimers.delete(key);
          void fetchAgents(key, false, gen);
        }, POLL_MS),
      );
    }
  }

  async function reload(): Promise<void> {
    const gen = ++generation;
    stopAllPolling();
    setBridge('loading');
    let machines: MachineView[];
    let error: string | null;
    try {
      ({ machines, error } = await client.machines());
    } catch {
      if (gen === generation && !disposed) setBridge('unreachable');
      return;
    }
    if (gen !== generation || disposed) return;
    setMachinesError(error);
    setGroups(machines.map((machine) => ({ machine, resp: null, polling: false })));
    setPick(preselect(groups(), pick()));
    setBridge('ready');
    await Promise.all(machines.map((m) => fetchAgents(m.key, false, gen)));
  }

  async function refresh(machineKey: string): Promise<void> {
    if (!groups().some((g) => g.machine.key === machineKey)) return;
    refreshingCounts.delete(machineKey);
    await fetchAgents(machineKey, true, generation);
  }

  return {
    bridge,
    groups,
    machinesError,
    pick,
    choose: (p) => setPick(p),
    reload,
    refresh,
    now,
    dispose() {
      disposed = true;
      stopAllPolling();
      if (tickTimer !== undefined) clearTimer(tickTimer);
      tickTimer = undefined;
    },
  };
}
