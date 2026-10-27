import type { Intent, Priority, Rejection } from '../draft/model.ts';

export type NoteOriginal = { intent: Intent; priority: Priority | null; comment: string };

export type NoteDraft = {
  mode: 'new' | 'edit';
  annotationId: string | null;
  intent: Intent;
  priority: Priority | null;
  showPriority: boolean;
  comment: string;
  original: NoteOriginal | null;
  error: string | null;
  minimized: boolean;
};

export type PillState = 'empty' | 'unsaved' | 'unsaved_changes' | 'clean';

const MAX_COMMENT = 2000;
const COUNTER_FROM = 1600;
const TOO_LONG = 'Keep it under 2,000 characters';

const REQUIRED_TEXT: Record<Intent, string | null> = {
  fix: 'Describe what is broken',
  change: 'Describe what should change',
  question: 'Write your question',
  approve: null,
};

export function newNote(): NoteDraft {
  return {
    mode: 'new',
    annotationId: null,
    intent: 'change',
    priority: null,
    showPriority: false,
    comment: '',
    original: null,
    error: null,
    minimized: false,
  };
}

export function editNote(a: {
  id: string;
  intent: Intent;
  priority: Priority | null;
  comment: string;
}): NoteDraft {
  return {
    mode: 'edit',
    annotationId: a.id,
    intent: a.intent,
    priority: a.priority,
    showPriority: a.priority !== null,
    comment: a.comment,
    original: { intent: a.intent, priority: a.priority, comment: a.comment },
    error: null,
    minimized: false,
  };
}

export function pillState(n: NoteDraft): PillState {
  if (n.mode === 'new') {
    const blank = n.comment.trim() === '' && n.intent === 'change' && n.priority === null;
    return blank ? 'empty' : 'unsaved';
  }
  const o = n.original;
  const changed =
    o === null || o.intent !== n.intent || o.priority !== n.priority || o.comment !== n.comment;
  return changed ? 'unsaved_changes' : 'clean';
}

export function pillText(state: PillState): string {
  switch (state) {
    case 'empty':
      return 'Empty';
    case 'unsaved':
      return 'Unsaved';
    case 'unsaved_changes':
      return 'Unsaved changes';
    case 'clean':
      return '';
  }
}

export function validate(n: NoteDraft): string | null {
  if (n.comment.length > MAX_COMMENT) return TOO_LONG;
  if (n.comment.trim() === '') return REQUIRED_TEXT[n.intent];
  return null;
}

export function rejectionText(reason: Rejection, intent: Intent): string {
  switch (reason) {
    case 'comment_required':
      return REQUIRED_TEXT[intent] ?? 'Could not save the annotation';
    case 'comment_too_long':
      return TOO_LONG;
    case 'wrong_phase':
      return 'The draft is locked while the drop runs';
    case 'not_found':
      return 'This annotation was deleted';
    default:
      return 'Could not save the annotation';
  }
}

export function counterText(comment: string): string {
  return comment.length >= COUNTER_FROM ? `${comment.length} / ${MAX_COMMENT}` : '';
}

export function noteHeading(a: {
  component: string | null;
  elementTag: string;
  elementLabel: string;
}): { title: string; tag: string; detail: string } {
  return {
    title: a.component ?? 'No component detected',
    tag: a.elementTag,
    detail: a.elementLabel.slice(a.elementTag.length).trim(),
  };
}
