import type { DropStatus } from '@herdrop/protocol';
import type { Destination, Draft, FailReason, LastDelivery } from '../../draft/model.ts';

export type FailedDraft = Extract<Draft, { phase: 'failed' }>;

export type StepState = 'done' | 'run' | 'todo' | 'fail' | 'warn';

export type StepRow = { label: string; detail: string; state: StepState };

export type ActionId = 'retry' | 'move' | 'copy' | 'discard';

export type Action = { id: ActionId; label: string };

export type FailureView = {
  variant: 'warn' | 'err';
  title: string;
  body: string;
  primary: Action;
  others: Action[];
};

const STEPS: { step: DropStatus['step']; label: string }[] = [
  { step: 'check_agent', label: 'Check agent' },
  { step: 'write_bundle', label: 'Write bundle' },
  { step: 'prompt_agent', label: 'Prompt agent' },
  { step: 'wait_activity', label: 'Wait for activity' },
];

const COPY: Action = { id: 'copy', label: 'Copy all' };
const MOVE: Action = { id: 'move', label: 'Move to another agent' };
const RETRY: Action = { id: 'retry', label: 'Retry' };
const DISCARD: Action = { id: 'discard', label: 'Discard' };

export function sendView(input: { count: number; pending: boolean }) {
  const { count, pending } = input;
  return {
    label: count ? `Send ${count}` : 'Send',
    unavailable: count === 0 || pending,
    tip: pending && count > 0 ? 'Finish or cancel the open note first' : null,
    copyUnavailable: count === 0,
  };
}

function bundlePath(destination: Destination): string {
  if (destination.folderKind === 'home') return '~/.herdrop/drop';
  const { folder } = destination;
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return `${folder}${sep}.herdrop${sep}drop`;
}

function runDetail(index: number, destination: Destination): string {
  if (index === 0) return `Pane ${destination.paneId} on ${destination.machineLabel}`;
  if (index === 1) {
    const verb = destination.local ? 'To' : 'Over SSH to';
    return `${verb} ${bundlePath(destination)}`;
  }
  if (index === 2) return 'Sending one line';
  return 'Waiting for the agent';
}

function failDetail(reason: FailReason, draft: FailedDraft): string {
  switch (reason) {
    case 'agent_blocked':
      return 'Waiting on a question or an approval';
    case 'agent_gone':
      return `Pane ${draft.destination.paneId} has no agent`;
    case 'sent_no_activity':
      return 'No activity reported';
    case 'failed':
      return draft.message ?? '';
    case 'bridge_unreachable':
      return '';
  }
}

export function stepsView(draft: Draft): StepRow[] {
  if (draft.phase !== 'sending' && draft.phase !== 'failed') {
    return STEPS.map((s) => ({ label: s.label, detail: '', state: 'todo' }));
  }
  const { drop, destination } = draft;
  const failedWithoutDrop = draft.phase === 'failed' && drop === null;
  const current = drop ? STEPS.findIndex((s) => s.step === drop.step) : 0;
  return STEPS.map((s, i) => {
    if (failedWithoutDrop) return { label: s.label, detail: '', state: 'todo' };
    if (i < current) return { label: s.label, detail: '', state: 'done' };
    if (i > current) return { label: s.label, detail: '', state: 'todo' };
    if (draft.phase === 'sending') {
      return { label: s.label, detail: runDetail(i, destination), state: 'run' };
    }
    const soft = draft.reason === 'agent_blocked' || draft.reason === 'sent_no_activity';
    return {
      label: s.label,
      detail: failDetail(draft.reason, draft),
      state: soft ? 'warn' : 'fail',
    };
  });
}

export function elapsedText(seconds: number, remote: boolean): string {
  return remote ? `${seconds} s / 15–20 s` : `${seconds} s`;
}

export function failureView(draft: FailedDraft): FailureView {
  const { reason, message } = draft;
  switch (reason) {
    case 'agent_blocked':
      return {
        variant: 'warn',
        title: 'Agent is blocked',
        body: 'Answer it in Herdr, then retry.',
        primary: RETRY,
        others: [COPY, MOVE, DISCARD],
      };
    case 'agent_gone':
      return {
        variant: 'err',
        title: 'Agent is gone',
        body: `Pane ${draft.destination.paneId} closed. Move the draft to another agent.`,
        primary: MOVE,
        others: [COPY, RETRY, DISCARD],
      };
    case 'sent_no_activity':
      return {
        variant: 'warn',
        title: 'No activity yet',
        body: 'Check the pane before you resend.',
        primary: { id: 'retry', label: 'Resend prompt' },
        others: [COPY, MOVE, DISCARD],
      };
    case 'failed':
      return {
        variant: 'err',
        title: 'Drop failed',
        body: message ?? 'Drop failed.',
        primary: RETRY,
        others: [COPY, MOVE, DISCARD],
      };
    case 'bridge_unreachable':
      return {
        variant: 'err',
        title: 'Bridge not running',
        body: message ?? 'Start Herdrop in Herdr, then retry.',
        primary: RETRY,
        others: [COPY, MOVE, DISCARD],
      };
  }
}

export function deliveredView(last: LastDelivery) {
  const noun = last.count === 1 ? 'annotation' : 'annotations';
  return {
    title: `Delivered to ${last.destinationName}`,
    dropId: last.dropId,
    where: `${last.count} ${noun} in ${last.bundleDir ?? last.dropId} on ${last.machineLabel}. The draft is empty again.`,
  };
}

export function deliverAnnouncement(prev: Draft, next: Draft): string | null {
  if (next.phase === 'sending' && prev.phase !== 'sending') {
    return `Sending ${next.annotations.length} annotations`;
  }
  if (prev.phase === 'sending' && next.phase === 'drafting' && next.lastDelivery !== null) {
    return `Delivered ${next.lastDelivery.count} annotations to ${next.lastDelivery.destinationName}`;
  }
  if (next.phase === 'failed' && prev.phase !== 'failed') {
    switch (next.reason) {
      case 'agent_blocked':
        return 'Drop stopped: the agent is blocked';
      case 'agent_gone':
        return 'Drop failed: the agent is gone';
      case 'sent_no_activity':
        return 'Sent, but no activity yet';
      case 'failed':
        return `Drop failed: ${next.message}`;
      case 'bridge_unreachable':
        return 'Drop failed: the bridge is not running';
    }
  }
  return null;
}
