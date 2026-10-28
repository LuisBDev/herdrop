import type { DropState, DropStatus } from '@herdrop/protocol';
import { describe, expect, it } from 'vitest';
import type { Capture } from '../capture/types.ts';
import { reduce } from '../draft/machine.ts';
import type { Annotation, Destination, Draft } from '../draft/model.ts';
import { createBridgeClient } from './client.ts';
import { type DeliveryDeps, LOST_MESSAGE, retryDraft, runDelivery, sendDraft } from './delivery.ts';

type Reply = (() => Response) | 'down';
type Sent = { method: string; path: string; body: unknown };

const destination: Destination = {
  machine: 'local',
  machineLabel: 'local',
  local: true,
  paneId: 'w1:p1',
  name: 'claude',
  kind: 'claude',
  folder: 'D:/app',
  folderKind: 'cwd',
  status: 'idle',
};

const note = (id: string, comment: string): Annotation => ({
  id,
  intent: 'change',
  priority: null,
  comment,
  capture: {} as Capture,
  createdAt: 0,
});

const drafting: Draft = {
  phase: 'drafting',
  destination,
  annotations: [note('a1', 'bigger'), note('a2', 'red')],
  undo: null,
  lastDelivery: null,
};

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

const created = (dropId: string) => json({ drop_id: dropId }, 202);
const apiError = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);
const notFound = apiError(404, 'drop_not_found', 'no drop');
const boom = apiError(500, 'internal', 'disk on fire');

function status(dropId: string, state: DropState, message: string | null = null): DropStatus {
  return {
    drop_id: dropId,
    machine: 'local',
    pane_id: 'w1:p1',
    state,
    step: 'prompt_agent',
    bundle_dir: state === 'delivered' ? `D:/app/.herdrop/drop/${dropId}` : null,
    message,
  };
}

const polled = (dropId: string, state: DropState, message: string | null = null) =>
  json(status(dropId, state, message));

function harness(initial: Draft, table: Record<string, Reply[]>) {
  let current = initial;
  let ids = 0;
  const sent: Sent[] = [];
  const sleeps: number[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(input)).pathname;
    sent.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const reply = table[`${method} ${path}`]?.shift();
    if (reply === undefined || reply === 'down') throw new TypeError('Failed to fetch');
    return reply();
  }) as typeof fetch;
  const deps: DeliveryDeps = {
    client: createBridgeClient(fetchFn, async () => 'http://127.0.0.1:47821'),
    readDraft: async () => current,
    dispatch: async (event) => {
      const result = reduce(current, event);
      if (result.ok) current = result.draft;
      return result;
    },
    render: (annotations) =>
      annotations.map((a, i) => ({ name: `A${i + 1}.md`, content: a.comment })),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    newRequestId: () => `req-${++ids}`,
  };
  return {
    deps,
    sent,
    sleeps,
    draft: () => current,
    replace: (draft: Draft) => {
      current = draft;
    },
    calls: () => sent.map((s) => `${s.method} ${s.path}`),
  };
}

const outcome = (draft: Draft) =>
  draft.phase === 'failed'
    ? { phase: draft.phase, reason: draft.reason, message: draft.message }
    : { phase: draft.phase };

describe('delivery driver', () => {
  it('send_posts_rendered_files_and_reports_delivered', async () => {
    const h = harness(drafting, {
      'POST /drops': [created('d1')],
      'GET /drops/d1': [
        polled('d1', 'running'),
        polled('d1', 'running'),
        polled('d1', 'delivered'),
      ],
    });

    await sendDraft(h.deps);

    expect(h.calls()).toEqual(['POST /drops', 'GET /drops/d1', 'GET /drops/d1', 'GET /drops/d1']);
    expect(h.sent[0]?.body).toEqual({
      client_request_id: 'req-1',
      machine: 'local',
      pane_id: 'w1:p1',
      files: [
        { name: 'A1.md', content: 'bigger' },
        { name: 'A2.md', content: 'red' },
      ],
    });
    expect(h.sleeps).toEqual([1000, 1000]);
    const draft = h.draft();
    expect(draft.phase).toBe('drafting');
    expect(draft.phase === 'drafting' && draft.lastDelivery).toMatchObject({
      dropId: 'd1',
      count: 2,
    });
  });

  it('retry_paths_table', async () => {
    const failedWith = async (dropId: string | null, rest: Record<string, Reply[]>) => {
      const setup: Record<string, Reply[]> =
        dropId === null
          ? { 'POST /drops': ['down'] }
          : { 'POST /drops': [created(dropId)], [`GET /drops/${dropId}`]: [boom] };
      const table = { ...rest };
      for (const [key, replies] of Object.entries(setup)) {
        table[key] = [...replies, ...(rest[key] ?? [])];
      }
      const h = harness(drafting, table);
      await sendDraft(h.deps);
      expect(h.draft().phase).toBe('failed');
      h.sent.length = 0;
      return h;
    };

    const same = await failedWith('d1', {
      'POST /drops/d1/retry': [created('d1')],
      'GET /drops/d1': [polled('d1', 'delivered')],
    });
    await retryDraft(same.deps);
    expect(same.calls()).toEqual(['POST /drops/d1/retry', 'GET /drops/d1']);
    expect(same.draft().phase).toBe('drafting');

    const restarted = await failedWith('d1', {
      'POST /drops/d1/retry': [notFound],
      'POST /drops': [created('d2')],
      'GET /drops/d2': [polled('d2', 'delivered')],
    });
    await retryDraft(restarted.deps);
    expect(restarted.calls()).toEqual(['POST /drops/d1/retry', 'POST /drops', 'GET /drops/d2']);
    expect(restarted.sent[1]?.body).toMatchObject({ client_request_id: 'req-2' });
    expect(restarted.draft().phase).toBe('drafting');

    const conflict = await failedWith('d1', {
      'POST /drops/d1/retry': [apiError(409, 'drop_running', 'busy')],
      'GET /drops/d1': [polled('d1', 'delivered')],
    });
    await retryDraft(conflict.deps);
    expect(conflict.calls()).toEqual(['POST /drops/d1/retry', 'GET /drops/d1']);
    expect(conflict.draft().phase).toBe('drafting');

    const neverCreated = await failedWith(null, {
      'POST /drops': [created('d3')],
      'GET /drops/d3': [polled('d3', 'delivered')],
    });
    await retryDraft(neverCreated.deps);
    expect(neverCreated.calls()).toEqual(['POST /drops', 'GET /drops/d3']);
    expect(neverCreated.sent[0]?.body).toMatchObject({ client_request_id: 'req-1' });
    expect(neverCreated.draft().phase).toBe('drafting');

    const interrupted = harness(
      {
        phase: 'sending',
        destination,
        annotations: drafting.annotations,
        clientRequestId: 'req-1',
        dropId: null,
        drop: null,
      },
      {},
    );
    await runDelivery(interrupted.deps, 'resume');
    expect(interrupted.calls()).toEqual([]);
    expect(outcome(interrupted.draft())).toEqual({
      phase: 'failed',
      reason: 'failed',
      message: 'Send was interrupted.',
    });
  });

  it('failures_never_leave_the_draft_sending_table', async () => {
    const down = (n: number): Reply[] => Array.from({ length: n }, () => 'down' as const);
    const rows: {
      name: string;
      table: Record<string, Reply[]>;
      retryAfter?: Record<string, Reply[]>;
      expected: ReturnType<typeof outcome>;
    }[] = [
      ...(['sent_no_activity', 'agent_gone', 'agent_blocked'] as const).map((state) => ({
        name: state,
        table: { 'POST /drops': [created('d1')], 'GET /drops/d1': [polled('d1', state, 'why')] },
        expected: { phase: 'failed' as const, reason: state, message: 'why' },
      })),
      {
        name: 'failed without message',
        table: { 'POST /drops': [created('d1')], 'GET /drops/d1': [polled('d1', 'failed')] },
        expected: { phase: 'failed', reason: 'failed', message: 'Drop failed.' },
      },
      {
        name: 'unreachable on create',
        table: { 'POST /drops': ['down'] },
        expected: { phase: 'failed', reason: 'bridge_unreachable', message: null },
      },
      {
        name: 'invalid bundle on create',
        table: { 'POST /drops': [apiError(400, 'invalid_bundle', 'bad file name')] },
        expected: { phase: 'failed', reason: 'failed', message: 'bad file name' },
      },
      {
        name: '500 on poll',
        table: { 'POST /drops': [created('d1')], 'GET /drops/d1': [boom] },
        expected: { phase: 'failed', reason: 'failed', message: 'disk on fire' },
      },
      {
        name: '500 on retry',
        table: { 'POST /drops': [created('d1')], 'GET /drops/d1': [boom] },
        retryAfter: { 'POST /drops/d1/retry': [apiError(500, 'internal', 'retry broke')] },
        expected: { phase: 'failed', reason: 'failed', message: 'retry broke' },
      },
      {
        name: 'lost while polling',
        table: { 'POST /drops': [created('d1')], 'GET /drops/d1': [notFound] },
        expected: { phase: 'failed', reason: 'bridge_unreachable', message: LOST_MESSAGE },
      },
      {
        name: 'four network failures then delivered',
        table: {
          'POST /drops': [created('d1')],
          'GET /drops/d1': [...down(4), polled('d1', 'delivered')],
        },
        expected: { phase: 'drafting' },
      },
      {
        name: 'five network failures',
        table: { 'POST /drops': [created('d1')], 'GET /drops/d1': [...down(5)] },
        expected: { phase: 'failed', reason: 'bridge_unreachable', message: null },
      },
    ];

    for (const row of rows) {
      const h = harness(drafting, { ...row.table, ...row.retryAfter });
      await sendDraft(h.deps);
      if (row.retryAfter) await retryDraft(h.deps);
      expect(outcome(h.draft()), row.name).toEqual(row.expected);
    }

    const decode = harness(drafting, { 'POST /drops': [json({ nope: true }, 202)] });
    await sendDraft(decode.deps);
    const decoded = decode.draft();
    expect(decoded.phase === 'failed' && decoded.reason).toBe('failed');
    expect(decoded.phase === 'failed' && decoded.message).toContain('expected');

    const flaky = harness(drafting, {
      'POST /drops': [created('d1')],
      'GET /drops/d1': [...down(4), polled('d1', 'running'), ...down(4), polled('d1', 'delivered')],
    });
    await sendDraft(flaky.deps);
    expect(flaky.draft().phase).toBe('drafting');
  });

  it('stops_when_a_dispatch_is_rejected', async () => {
    const h = harness(drafting, {
      'POST /drops': [created('d1')],
      'GET /drops/d1': [
        polled('d1', 'running'),
        () => {
          h.replace(drafting);
          return polled('d1', 'running')();
        },
        polled('d1', 'running'),
        polled('d1', 'delivered'),
      ],
    });

    await sendDraft(h.deps);

    expect(h.calls()).toEqual(['POST /drops', 'GET /drops/d1', 'GET /drops/d1']);
    expect(h.draft()).toBe(drafting);
  });
});
