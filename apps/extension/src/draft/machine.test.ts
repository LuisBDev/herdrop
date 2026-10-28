import type { DropStatus } from '@herdrop/protocol';
import { describe, expect, it } from 'vitest';
import type { Capture } from '../capture/types.ts';
import { annotationNumber, initialDraft, reduce } from './machine.ts';
import type { Annotation, Destination, Draft, DraftEvent, Intent } from './model.ts';

const destination: Destination = {
  machine: 'local',
  machineLabel: 'local',
  local: true,
  paneId: 'p1',
  name: 'claude',
  kind: 'claude',
  folder: 'D:/app',
  folderKind: 'cwd',
  status: 'idle',
};

const remote: Destination = {
  ...destination,
  machine: '779f8353534145c8951edca5f0dd34cd',
  machineLabel: 'devbox',
  local: false,
  paneId: 'p9',
  name: 'codex',
};

function note(id: string, comment = 'make it bigger', intent: Intent = 'change'): Annotation {
  return { id, intent, priority: null, comment, capture: {} as Capture, createdAt: 0 };
}

function drop(dropId: string, state: DropStatus['state'] = 'running'): DropStatus {
  return {
    drop_id: dropId,
    machine: 'local',
    pane_id: 'p1',
    state,
    step: 'prompt_agent',
    bundle_dir: `D:/app/.herdrop/drop/${dropId}`,
    message: null,
  };
}

const empty: Draft = {
  phase: 'drafting',
  destination,
  annotations: [],
  undo: null,
  lastDelivery: null,
};
const one: Draft = { ...empty, annotations: [note('a1')] };
const sending: Draft = {
  phase: 'sending',
  destination,
  annotations: [note('a1')],
  clientRequestId: 'req-1',
  dropId: 'd1',
  drop: null,
};
const failed: Draft = {
  ...sending,
  phase: 'failed',
  reason: 'agent_gone',
  message: null,
};

function run(draft: Draft, events: DraftEvent[]) {
  let current = draft;
  for (const event of events) {
    const result = reduce(current, event);
    if (!result.ok) return result;
    current = result.draft;
  }
  return { ok: true as const, draft: current };
}

function outcome(result: ReturnType<typeof run>): string {
  return result.ok ? result.draft.phase : result.reason;
}

describe('draft machine', () => {
  it.each<{
    name: string;
    from: Draft;
    events: DraftEvent[];
    expect: string;
    verify?: (d: Draft) => void;
  }>([
    {
      name: 'pick from no_destination',
      from: { ...initialDraft, annotations: [note('a1')] },
      events: [{ type: 'destination.pick', destination }],
      expect: 'drafting',
      verify: (d) => expect(d.annotations).toHaveLength(1),
    },
    {
      name: 'pick while drafting',
      from: empty,
      events: [{ type: 'destination.pick', destination: remote }],
      expect: 'wrong_phase',
    },
    {
      name: 'clear empty draft',
      from: empty,
      events: [{ type: 'destination.clear' }],
      expect: 'no_destination',
    },
    {
      name: 'clear non-empty draft',
      from: one,
      events: [{ type: 'destination.clear' }],
      expect: 'draft_not_empty',
    },
    {
      name: 'add without destination',
      from: initialDraft,
      events: [{ type: 'annotation.add', annotation: note('a2') }],
      expect: 'wrong_phase',
    },
    {
      name: 'add blank change',
      from: empty,
      events: [{ type: 'annotation.add', annotation: note('a2', '   ') }],
      expect: 'comment_required',
    },
    {
      name: 'add blank approve',
      from: empty,
      events: [{ type: 'annotation.add', annotation: note('a2', '', 'approve') }],
      expect: 'drafting',
    },
    {
      name: 'add too long',
      from: empty,
      events: [{ type: 'annotation.add', annotation: note('a2', 'x'.repeat(2001)) }],
      expect: 'comment_too_long',
    },
    {
      name: 'update fields',
      from: {
        ...empty,
        annotations: [{ ...note('a1'), capture: { tag: 'x' } as unknown as Capture, createdAt: 7 }],
      },
      events: [
        {
          type: 'annotation.update',
          id: 'a1',
          intent: 'fix',
          priority: 'blocking',
          comment: 'new comment',
        },
      ],
      expect: 'drafting',
      verify: (d) =>
        expect(d.annotations).toEqual([
          {
            id: 'a1',
            intent: 'fix',
            priority: 'blocking',
            comment: 'new comment',
            capture: { tag: 'x' },
            createdAt: 7,
          },
        ]),
    },
    {
      name: 'add second annotation',
      from: one,
      events: [{ type: 'annotation.add', annotation: note('a2', 'second') }],
      expect: 'drafting',
      verify: (d) => expect(d.annotations.map((a) => a.id)).toEqual(['a1', 'a2']),
    },
    {
      name: 'discard from drafting',
      from: { ...one, undo: { annotation: note('a0'), index: 0 } },
      events: [{ type: 'draft.discard' }],
      expect: 'drafting',
      verify: (d) => expect(d).toEqual({ ...empty, destination }),
    },
    {
      name: 'update blank fix',
      from: one,
      events: [{ type: 'annotation.update', id: 'a1', intent: 'fix', priority: null, comment: '' }],
      expect: 'comment_required',
    },
    {
      name: 'update unknown',
      from: one,
      events: [
        { type: 'annotation.update', id: 'zz', intent: 'fix', priority: 'blocking', comment: 'ok' },
      ],
      expect: 'not_found',
    },
    {
      name: 'delete unknown',
      from: one,
      events: [{ type: 'annotation.delete', id: 'zz' }],
      expect: 'not_found',
    },
    {
      name: 'undo without delete',
      from: one,
      events: [{ type: 'annotation.undoDelete' }],
      expect: 'not_found',
    },
    {
      name: 'discard from failed',
      from: failed,
      events: [{ type: 'draft.discard' }],
      expect: 'drafting',
      verify: (d) => expect(d).toEqual({ ...empty, destination }),
    },
    {
      name: 'discard without destination',
      from: initialDraft,
      events: [{ type: 'draft.discard' }],
      expect: 'wrong_phase',
    },
    {
      name: 'start empty',
      from: empty,
      events: [{ type: 'send.start', clientRequestId: 'req-1' }],
      expect: 'no_annotations',
    },
    {
      name: 'start',
      from: one,
      events: [{ type: 'send.start', clientRequestId: 'req-1' }],
      expect: 'sending',
    },
    {
      name: 'created with another id',
      from: sending,
      events: [{ type: 'send.created', dropId: 'd2' }],
      expect: 'stale_drop',
    },
    {
      name: 'progress of another drop',
      from: sending,
      events: [{ type: 'send.progress', drop: drop('d2') }],
      expect: 'stale_drop',
    },
    {
      name: 'progress',
      from: sending,
      events: [{ type: 'send.progress', drop: drop('d1') }],
      expect: 'sending',
      verify: (d) => expect(d).toMatchObject({ drop: { drop_id: 'd1' } }),
    },
    {
      name: 'failed without drop',
      from: sending,
      events: [{ type: 'send.failed', reason: 'bridge_unreachable', drop: null, message: 'down' }],
      expect: 'failed',
    },
    {
      name: 'retry while drafting',
      from: one,
      events: [{ type: 'send.retry' }],
      expect: 'wrong_phase',
    },
    {
      name: 'add while sending',
      from: sending,
      events: [{ type: 'annotation.add', annotation: note('a2') }],
      expect: 'wrong_phase',
    },
    {
      name: 'move then pick retargets every annotation',
      from: { ...failed, annotations: [note('a1'), note('a2')] },
      events: [
        { type: 'send.moveToAnotherAgent' },
        { type: 'destination.pick', destination: remote },
      ],
      expect: 'drafting',
      verify: (d) =>
        expect(d).toMatchObject({
          destination: remote,
          annotations: [{ id: 'a1' }, { id: 'a2' }],
          undo: null,
          lastDelivery: null,
        }),
    },
  ])('transitions_table: $name', (row) => {
    const result = run(row.from, row.events);
    expect(outcome(result)).toBe(row.expect);
    if (row.verify && result.ok) row.verify(result.draft);
  });

  it('numbers_stay_compact_and_undo_restores_them', () => {
    const from: Draft = { ...empty, annotations: [note('a1'), note('a2'), note('a3')] };

    const deleted = run(from, [{ type: 'annotation.delete', id: 'a2' }]);
    if (!deleted.ok) throw new Error(deleted.reason);
    expect(annotationNumber(deleted.draft, 'a3')).toBe(2);
    expect(annotationNumber(deleted.draft, 'a2')).toBeNull();

    const restored = run(deleted.draft, [{ type: 'annotation.undoDelete' }]);
    if (!restored.ok) throw new Error(restored.reason);
    expect(annotationNumber(restored.draft, 'a2')).toBe(2);
    expect(annotationNumber(restored.draft, 'a3')).toBe(3);
    expect(outcome(run(restored.draft, [{ type: 'annotation.undoDelete' }]))).toBe('not_found');
  });

  it('send_ids_survive_retry_and_recreate', () => {
    const from: Draft = { ...empty, destination: remote, annotations: [note('a1'), note('a2')] };

    const retried = run(from, [
      { type: 'send.start', clientRequestId: 'req-1' },
      { type: 'send.created', dropId: 'd1' },
      {
        type: 'send.failed',
        reason: 'agent_blocked',
        drop: drop('d1', 'agent_blocked'),
        message: null,
      },
      { type: 'send.retry' },
    ]);
    if (!retried.ok) throw new Error(retried.reason);
    expect(retried.draft).toMatchObject({
      phase: 'sending',
      clientRequestId: 'req-1',
      dropId: 'd1',
    });

    const recreated = run(retried.draft, [{ type: 'send.recreate', clientRequestId: 'req-2' }]);
    if (!recreated.ok) throw new Error(recreated.reason);
    expect(recreated.draft).toMatchObject({
      phase: 'sending',
      clientRequestId: 'req-2',
      dropId: null,
      drop: null,
    });

    const delivered = run(recreated.draft, [
      { type: 'send.created', dropId: 'd3' },
      { type: 'send.created', dropId: 'd3' },
      { type: 'send.delivered', drop: drop('d3', 'delivered') },
    ]);
    if (!delivered.ok) throw new Error(delivered.reason);
    expect(delivered.draft).toEqual({
      phase: 'drafting',
      destination: remote,
      annotations: [],
      undo: null,
      lastDelivery: {
        dropId: 'd3',
        count: 2,
        bundleDir: 'D:/app/.herdrop/drop/d3',
        destinationName: 'codex',
        machine: remote.machine,
        machineLabel: 'devbox',
        local: false,
      },
    });
  });
});
