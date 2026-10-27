import type { DropStatus } from '@herdrop/protocol';
import { describe, expect, it } from 'vitest';
import type { Destination, Draft, FailReason, LastDelivery } from '../../draft/model.ts';
import {
  deliverAnnouncement,
  deliveredView,
  elapsedText,
  type FailedDraft,
  failureView,
  sendView,
  stepsView,
} from './deliver-view.ts';

const local: Destination = {
  machine: 'local',
  machineLabel: 'local',
  local: true,
  paneId: 'p1',
  name: 'claude',
  kind: 'claude',
  folder: 'D:\\Mis Proyectos\\app',
  folderKind: 'cwd',
  status: 'idle',
};

const remote: Destination = {
  ...local,
  machine: '779f8353534145c8951edca5f0dd34cd',
  machineLabel: 'devbox',
  local: false,
  folder: '/home/dev/app',
};

const home: Destination = { ...local, folder: '~/.herdrop', folderKind: 'home' };

function drop(step: DropStatus['step']): DropStatus {
  return {
    drop_id: 'd1',
    machine: 'local',
    pane_id: 'p1',
    state: 'running',
    step,
    bundle_dir: null,
    message: null,
  };
}

function annotations(n: number): Draft['annotations'] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    intent: 'change' as const,
    priority: null,
    comment: 'x',
    capture: {} as never,
    createdAt: 0,
  }));
}

function sending(destination: Destination, d: DropStatus | null, count = 0): Draft {
  return {
    phase: 'sending',
    destination,
    annotations: annotations(count),
    clientRequestId: 'c1',
    dropId: d ? d.drop_id : null,
    drop: d,
  };
}

function failed(
  reason: FailReason,
  d: DropStatus | null,
  message: string | null = null,
): FailedDraft {
  return {
    phase: 'failed',
    destination: local,
    annotations: annotations(2),
    clientRequestId: 'c1',
    dropId: d ? d.drop_id : null,
    drop: d,
    reason,
    message,
  };
}

describe('send_view_label_and_tip', () => {
  it.each([
    [{ count: 0, pending: false }, 'Send', true, null, true],
    [{ count: 3, pending: false }, 'Send 3', false, null, false],
    [{ count: 3, pending: true }, 'Send 3', true, 'Finish or cancel the open note first', false],
  ])('%j', (input, label, unavailable, tip, copyUnavailable) => {
    expect(sendView(input)).toEqual({ label, unavailable, tip, copyUnavailable });
  });
});

describe('steps_view_details_and_states', () => {
  const detail = (d: Draft) => stepsView(d).map((r) => r.detail);

  it('shows the run detail of each step with the right path style', () => {
    expect(detail(sending(local, null))).toEqual(['Pane p1 on local', '', '', '']);
    expect(detail(sending(local, drop('write_bundle')))[1]).toBe(
      'To D:\\Mis Proyectos\\app\\.herdrop\\drop',
    );
    expect(detail(sending(remote, drop('write_bundle')))[1]).toBe(
      'Over SSH to /home/dev/app/.herdrop/drop',
    );
    expect(detail(sending(home, drop('write_bundle')))[1]).toBe('To ~/.herdrop/drop');
    expect(detail(sending(local, drop('prompt_agent')))[2]).toBe('Sending one line');
    expect(detail(sending(local, drop('wait_activity')))[3]).toBe('Waiting for the agent');
  });

  it('marks done, run and todo rows while sending', () => {
    const rows = stepsView(sending(local, drop('prompt_agent')));
    expect(rows.map((r) => r.label)).toEqual([
      'Check agent',
      'Write bundle',
      'Prompt agent',
      'Wait for activity',
    ]);
    expect(rows.map((r) => r.state)).toEqual(['done', 'done', 'run', 'todo']);
  });

  it('marks a blocked agent row as warn and a gone agent as fail', () => {
    const blocked = stepsView(failed('agent_blocked', drop('check_agent')));
    expect(blocked[0]).toEqual({
      label: 'Check agent',
      detail: 'Waiting on a question or an approval',
      state: 'warn',
    });
    const gone = stepsView(failed('agent_gone', drop('prompt_agent')));
    expect(gone[2]).toMatchObject({ detail: 'Pane p1 has no agent', state: 'fail' });
    expect(gone[3]).toEqual({ label: 'Wait for activity', detail: '', state: 'todo' });
  });

  it('marks every row todo when a failed draft has no drop', () => {
    const rows = stepsView(failed('bridge_unreachable', null));
    expect(rows.map((r) => r.state)).toEqual(['todo', 'todo', 'todo', 'todo']);
    expect(rows.map((r) => r.detail)).toEqual(['', '', '', '']);
  });

  it('formats elapsed time', () => {
    expect(elapsedText(7, false)).toBe('7 s');
    expect(elapsedText(7, true)).toBe('7 s / 15–20 s');
  });
});

describe('failure_view_per_reason', () => {
  const copy = { id: 'copy', label: 'Copy all' };
  const move = { id: 'move', label: 'Move to another agent' };
  const retry = { id: 'retry', label: 'Retry' };
  const discard = { id: 'discard', label: 'Discard' };

  it.each([
    [
      failed('agent_blocked', drop('check_agent')),
      'warn',
      'Agent is blocked',
      'Answer it in Herdr, then retry.',
      retry,
      [copy, move, discard],
    ],
    [
      failed('agent_gone', drop('check_agent')),
      'err',
      'Agent is gone',
      'Pane p1 closed. Move the draft to another agent.',
      move,
      [copy, retry, discard],
    ],
    [
      failed('sent_no_activity', drop('wait_activity')),
      'warn',
      'No activity yet',
      'Check the pane before you resend.',
      { id: 'retry', label: 'Resend prompt' },
      [copy, move, discard],
    ],
    [
      failed('failed', drop('write_bundle'), 'disk full'),
      'err',
      'Drop failed',
      'disk full',
      retry,
      [copy, move, discard],
    ],
    [failed('failed', null), 'err', 'Drop failed', 'Drop failed.', retry, [copy, move, discard]],
    [
      failed('bridge_unreachable', null, 'Send was interrupted.'),
      'err',
      'Bridge not running',
      'Send was interrupted.',
      retry,
      [copy, move, discard],
    ],
    [
      failed('bridge_unreachable', null),
      'err',
      'Bridge not running',
      'Start Herdrop in Herdr, then retry.',
      retry,
      [copy, move, discard],
    ],
  ])('%#', (draft, variant, title, body, primary, others) => {
    expect(failureView(draft)).toEqual({ variant, title, body, primary, others });
  });
});

describe('delivered_view', () => {
  const last: LastDelivery = {
    dropId: '20260101-120000-abcd',
    count: 1,
    bundleDir: null,
    destinationName: 'claude',
    machine: 'local',
    machineLabel: 'local',
    local: true,
  };

  it('pluralizes and falls back to the drop id', () => {
    expect(deliveredView(last)).toEqual({
      title: 'Delivered to claude',
      dropId: last.dropId,
      where: `1 annotation in ${last.dropId} on local. The draft is empty again.`,
    });
    expect(deliveredView({ ...last, count: 2, bundleDir: '/x/drop/1' }).where).toBe(
      '2 annotations in /x/drop/1 on local. The draft is empty again.',
    );
  });
});

describe('announcements_for_each_transition', () => {
  const idle: Draft = {
    phase: 'drafting',
    destination: local,
    annotations: annotations(2),
    undo: null,
    lastDelivery: null,
  };
  const delivered: Draft = {
    ...idle,
    annotations: [],
    lastDelivery: {
      dropId: 'd1',
      count: 2,
      bundleDir: null,
      destinationName: 'claude',
      machine: 'local',
      machineLabel: 'local',
      local: true,
    },
  };
  const live = sending(local, drop('check_agent'), 2);

  it.each([
    [idle, live, 'Sending 2 annotations'],
    [live, delivered, 'Delivered 2 annotations to claude'],
    [live, failed('agent_blocked', null), 'Drop stopped: the agent is blocked'],
    [live, failed('agent_gone', null), 'Drop failed: the agent is gone'],
    [live, failed('sent_no_activity', null), 'Sent, but no activity yet'],
    [live, failed('failed', null, 'disk full'), 'Drop failed: disk full'],
    [live, failed('bridge_unreachable', null), 'Drop failed: the bridge is not running'],
    [live, sending(local, drop('write_bundle'), 2), null],
    [idle, idle, null],
  ])('%#', (prev, next, text) => {
    expect(deliverAnnouncement(prev, next)).toBe(text);
  });
});
