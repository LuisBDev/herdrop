import type { AgentStatus, DropStatus, FolderKind } from '@herdrop/protocol';
import type { Capture } from '../capture/types.ts';

export type Intent = 'fix' | 'change' | 'question' | 'approve';

export type Priority = 'blocking' | 'important' | 'suggestion';

export type Destination = {
  machine: string;
  machineLabel: string;
  local: boolean;
  paneId: string;
  name: string;
  kind: string | null;
  folder: string;
  folderKind: FolderKind;
  status: AgentStatus;
};

export type Annotation = {
  id: string;
  intent: Intent;
  priority: Priority | null;
  comment: string;
  capture: Capture;
  createdAt: number;
};

export type FailReason =
  | 'agent_gone'
  | 'agent_blocked'
  | 'sent_no_activity'
  | 'failed'
  | 'bridge_unreachable';

export type LastDelivery = {
  dropId: string;
  count: number;
  bundleDir: string | null;
  destinationName: string;
  machine: string;
  machineLabel: string;
  local: boolean;
};

export type Undo = { annotation: Annotation; index: number };

export type Draft =
  | {
      phase: 'no_destination';
      annotations: Annotation[];
      undo: Undo | null;
      lastDelivery: LastDelivery | null;
    }
  | {
      phase: 'drafting';
      destination: Destination;
      annotations: Annotation[];
      undo: Undo | null;
      lastDelivery: LastDelivery | null;
    }
  | {
      phase: 'sending';
      destination: Destination;
      annotations: Annotation[];
      clientRequestId: string;
      dropId: string | null;
      drop: DropStatus | null;
    }
  | {
      phase: 'failed';
      destination: Destination;
      annotations: Annotation[];
      clientRequestId: string;
      dropId: string | null;
      drop: DropStatus | null;
      reason: FailReason;
      message: string | null;
    };

export type DraftEvent =
  | { type: 'destination.pick'; destination: Destination }
  | { type: 'destination.clear' }
  | { type: 'annotation.add'; annotation: Annotation }
  | {
      type: 'annotation.update';
      id: string;
      intent: Intent;
      priority: Priority | null;
      comment: string;
    }
  | { type: 'annotation.delete'; id: string }
  | { type: 'annotation.undoDelete' }
  | { type: 'draft.discard' }
  | { type: 'send.start'; clientRequestId: string }
  | { type: 'send.created'; dropId: string }
  | { type: 'send.recreate'; clientRequestId: string }
  | { type: 'send.progress'; drop: DropStatus }
  | { type: 'send.delivered'; drop: DropStatus }
  | { type: 'send.failed'; reason: FailReason; drop: DropStatus | null; message: string | null }
  | { type: 'send.retry' }
  | { type: 'send.moveToAnotherAgent' };

export type Rejection =
  | 'wrong_phase'
  | 'draft_not_empty'
  | 'comment_required'
  | 'comment_too_long'
  | 'no_annotations'
  | 'not_found'
  | 'stale_drop'
  | 'note_pending';

export type DispatchResult = { ok: true; draft: Draft } | { ok: false; reason: Rejection };
