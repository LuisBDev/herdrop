import type { DropStatus } from '@herdrop/protocol';
import type { DispatchResult, Draft, DraftEvent, Intent, Rejection } from './model.ts';

export const COMMENT_MAX = 2000;

export const initialDraft: Draft = {
  phase: 'no_destination',
  annotations: [],
  undo: null,
  lastDelivery: null,
};

type Drafting = Extract<Draft, { phase: 'drafting' }>;
type Sending = Extract<Draft, { phase: 'sending' }>;
type Failed = Extract<Draft, { phase: 'failed' }>;

const accept = (draft: Draft): DispatchResult => ({ ok: true, draft });
const reject = (reason: Rejection): DispatchResult => ({ ok: false, reason });

function commentProblem(intent: Intent, comment: string): Rejection | null {
  if (intent !== 'approve' && comment.trim() === '') return 'comment_required';
  if (comment.length > COMMENT_MAX) return 'comment_too_long';
  return null;
}

function isCurrentDrop(draft: Sending, drop: DropStatus): boolean {
  return drop.drop_id === draft.dropId;
}

function discarded(draft: Drafting | Failed): Draft {
  return {
    phase: 'drafting',
    destination: draft.destination,
    annotations: [],
    undo: null,
    lastDelivery: null,
  };
}

function reduceDrafting(draft: Drafting, event: DraftEvent): DispatchResult {
  switch (event.type) {
    case 'destination.clear':
      if (draft.annotations.length > 0) return reject('draft_not_empty');
      return accept({
        phase: 'no_destination',
        annotations: [],
        undo: draft.undo,
        lastDelivery: draft.lastDelivery,
      });
    case 'annotation.add': {
      const problem = commentProblem(event.annotation.intent, event.annotation.comment);
      if (problem) return reject(problem);
      return accept({ ...draft, annotations: [...draft.annotations, event.annotation] });
    }
    case 'annotation.update': {
      const problem = commentProblem(event.intent, event.comment);
      if (problem) return reject(problem);
      if (!draft.annotations.some((a) => a.id === event.id)) return reject('not_found');
      const { intent, priority, comment } = event;
      return accept({
        ...draft,
        annotations: draft.annotations.map((a) =>
          a.id === event.id ? { ...a, intent, priority, comment } : a,
        ),
      });
    }
    case 'annotation.delete': {
      const index = draft.annotations.findIndex((a) => a.id === event.id);
      const annotation = draft.annotations[index];
      if (!annotation) return reject('not_found');
      return accept({
        ...draft,
        annotations: draft.annotations.filter((a) => a.id !== event.id),
        undo: { annotation, index },
      });
    }
    case 'annotation.undoDelete': {
      if (!draft.undo) return reject('not_found');
      const annotations = [...draft.annotations];
      annotations.splice(Math.min(draft.undo.index, annotations.length), 0, draft.undo.annotation);
      return accept({ ...draft, annotations, undo: null });
    }
    case 'draft.discard':
      return accept(discarded(draft));
    case 'send.start':
      if (draft.annotations.length === 0) return reject('no_annotations');
      return accept({
        phase: 'sending',
        destination: draft.destination,
        annotations: draft.annotations,
        clientRequestId: event.clientRequestId,
        dropId: null,
        drop: null,
      });
    default:
      return reject('wrong_phase');
  }
}

function reduceSending(draft: Sending, event: DraftEvent): DispatchResult {
  switch (event.type) {
    case 'send.created':
      if (draft.dropId === null) return accept({ ...draft, dropId: event.dropId });
      if (draft.dropId === event.dropId) return accept(draft);
      return reject('stale_drop');
    case 'send.recreate':
      return accept({ ...draft, clientRequestId: event.clientRequestId, dropId: null, drop: null });
    case 'send.progress':
      if (!isCurrentDrop(draft, event.drop)) return reject('stale_drop');
      return accept({ ...draft, drop: event.drop });
    case 'send.delivered': {
      if (!isCurrentDrop(draft, event.drop)) return reject('stale_drop');
      const { destination } = draft;
      return accept({
        phase: 'drafting',
        destination,
        annotations: [],
        undo: null,
        lastDelivery: {
          dropId: event.drop.drop_id,
          count: draft.annotations.length,
          bundleDir: event.drop.bundle_dir,
          destinationName: destination.name,
          machine: destination.machine,
          machineLabel: destination.machineLabel,
          local: destination.local,
        },
      });
    }
    case 'send.failed':
      if (event.drop && !isCurrentDrop(draft, event.drop)) return reject('stale_drop');
      return accept({
        ...draft,
        phase: 'failed',
        drop: event.drop,
        reason: event.reason,
        message: event.message,
      });
    default:
      return reject('wrong_phase');
  }
}

function reduceFailed(draft: Failed, event: DraftEvent): DispatchResult {
  switch (event.type) {
    case 'draft.discard':
      return accept(discarded(draft));
    case 'send.retry':
      return accept({
        phase: 'sending',
        destination: draft.destination,
        annotations: draft.annotations,
        clientRequestId: draft.clientRequestId,
        dropId: draft.dropId,
        drop: draft.drop,
      });
    case 'send.moveToAnotherAgent':
      return accept({
        phase: 'no_destination',
        annotations: draft.annotations,
        undo: null,
        lastDelivery: null,
      });
    default:
      return reject('wrong_phase');
  }
}

export function reduce(draft: Draft, event: DraftEvent): DispatchResult {
  switch (draft.phase) {
    case 'no_destination':
      if (event.type !== 'destination.pick') return reject('wrong_phase');
      return accept({
        phase: 'drafting',
        destination: event.destination,
        annotations: draft.annotations,
        undo: null,
        lastDelivery: draft.lastDelivery,
      });
    case 'drafting':
      return reduceDrafting(draft, event);
    case 'sending':
      return reduceSending(draft, event);
    case 'failed':
      return reduceFailed(draft, event);
  }
}

export function annotationNumber(draft: Draft, id: string): number | null {
  const index = draft.annotations.findIndex((a) => a.id === id);
  return index === -1 ? null : index + 1;
}
