import type { AgentsResponse, MachineView } from '@herdrop/protocol';
import { type Accessor, createSignal } from 'solid-js';
import { type BridgeClient, BridgeUnreachable } from '../../bridge/client.ts';
import { type Pick, preselect } from './agents-view.ts';

const POLL_MS = 1000;
const TICK_MS = 1000;

type TimerId = ReturnType<typeof setTimeout>;

type Visibility = EventTarget & { readonly visibilityState: DocumentVisibilityState };

type FetchMode = 'initial' | 'forced' | 'tick';

type Poll = { timer: TimerId | undefined; inFlight: boolean; forcePending: boolean };

export type BridgeState = 'loading' | 'ready' | 'unreachable';

export type AgentGroup = {
  machine: MachineView;
  resp: AgentsResponse | null;
  busy: boolean;
  failed: boolean;
};

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
  visibility?: Visibility;
}): Agents {
  const { client } = deps;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  const clock = deps.now ?? Date.now;
  const visibility = deps.visibility ?? document;

  const [bridge, setBridge] = createSignal<BridgeState>('loading');
  const [groups, setGroups] = createSignal<AgentGroup[]>([]);
  const [machinesError, setMachinesError] = createSignal<string | null>(null);
  const [pick, setPick] = createSignal<Pick | null>(null);
  const [now, setNow] = createSignal(clock());

  let polls = new Map<string, Poll>();
  let generation = 0;
  let disposed = false;

  const tick = () => {
    setNow(clock());
    tickTimer = setTimer(tick, TICK_MS);
  };
  let tickTimer: TimerId | undefined = setTimer(tick, TICK_MS);

  const visible = () => visibility.visibilityState === 'visible';

  function update(key: string, change: Partial<Omit<AgentGroup, 'machine'>>) {
    const next = groups().map((g) => (g.machine.key === key ? { ...g, ...change } : g));
    setGroups(next);
    setPick(preselect(next, pick()));
  }

  function stopTimer(poll: Poll) {
    if (poll.timer !== undefined) clearTimer(poll.timer);
    poll.timer = undefined;
  }

  function stopAllTimers() {
    for (const poll of polls.values()) stopTimer(poll);
  }

  function next(key: string, poll: Poll, gen: number) {
    if (gen !== generation || disposed) return;
    if (poll.forcePending) {
      poll.forcePending = false;
      void fetchAgents(key, poll, 'forced', gen);
      return;
    }
    if (!visible()) return;
    poll.timer = setTimer(() => {
      poll.timer = undefined;
      void fetchAgents(key, poll, 'tick', gen);
    }, POLL_MS);
  }

  async function fetchAgents(key: string, poll: Poll, mode: FetchMode, gen: number) {
    stopTimer(poll);
    poll.inFlight = true;
    if (mode !== 'tick') update(key, { busy: true });
    let resp: AgentsResponse;
    try {
      resp =
        mode === 'forced' ? await client.agents(key, { refresh: true }) : await client.agents(key);
    } catch (error) {
      poll.inFlight = false;
      if (gen !== generation || disposed) return;
      if (mode !== 'tick') {
        const unreachable = error instanceof BridgeUnreachable;
        if (unreachable) setBridge('unreachable');
        update(key, { busy: poll.forcePending, failed: !unreachable });
      }
      next(key, poll, gen);
      return;
    }
    poll.inFlight = false;
    if (gen !== generation || disposed) return;
    const shown = groups().find((g) => g.machine.key === key)?.busy ?? false;
    update(key, { resp, busy: poll.forcePending || (shown && resp.refreshing), failed: false });
    next(key, poll, gen);
  }

  function onVisibilityChange() {
    if (!visible()) {
      stopAllTimers();
      return;
    }
    for (const [key, poll] of polls) {
      if (!poll.inFlight) void fetchAgents(key, poll, 'tick', generation);
    }
  }
  visibility.addEventListener('visibilitychange', onVisibilityChange);

  async function reload(): Promise<void> {
    const gen = ++generation;
    stopAllTimers();
    polls = new Map();
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
    setGroups(machines.map((machine) => ({ machine, resp: null, busy: false, failed: false })));
    setPick(preselect(groups(), pick()));
    setBridge('ready');
    const started = machines.map((m) => {
      const poll: Poll = { timer: undefined, inFlight: false, forcePending: false };
      polls.set(m.key, poll);
      return fetchAgents(m.key, poll, 'initial', gen);
    });
    await Promise.all(started);
  }

  async function refresh(machineKey: string): Promise<void> {
    const poll = polls.get(machineKey);
    if (!poll) return;
    if (poll.inFlight) {
      poll.forcePending = true;
      update(machineKey, { busy: true });
      return;
    }
    await fetchAgents(machineKey, poll, 'forced', generation);
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
      stopAllTimers();
      visibility.removeEventListener('visibilitychange', onVisibilityChange);
      if (tickTimer !== undefined) clearTimer(tickTimer);
      tickTimer = undefined;
    },
  };
}
