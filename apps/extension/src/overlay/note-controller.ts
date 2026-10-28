import { type Accessor, createEffect, createMemo, createSignal, on, untrack } from 'solid-js';
import type { Capture } from '../capture/types.ts';
import type { DispatchResult, DraftEvent } from '../draft/model.ts';
import type { PageState, PendingNoteInput, PendingResult } from '../messaging/types.ts';
import { componentName, elementLabel, elementTag } from '../render/label.ts';
import {
  editNote,
  type NoteDraft,
  newNote,
  noteHeading,
  pillState,
  rejectionText,
  validate,
} from './note-state.ts';
import type { OverlayState } from './overlay-state.ts';
import { initialPosition, type Position, type Viewport } from './placement.ts';

export type NoteHeading = { title: string; tag: string; detail: string };

export type NoteSession = {
  key: string;
  note: NoteDraft;
  number: number;
  heading: NoteHeading;
  target: Element | null;
  capture: Capture | null;
  pos: Position | null;
};

export type NoteControllerDeps = {
  state: OverlayState;
  capture: (el: Element) => Promise<Capture>;
  dispatch: (e: DraftEvent) => Promise<DispatchResult>;
  setPendingNote: (note: PendingNoteInput | null) => Promise<PendingResult>;
  locate: (selector: string) => Element | null;
  viewport: () => Viewport;
  newId?: () => string;
  now?: () => number;
};

export type NoteController = {
  session: Accessor<NoteSession | null>;
  openNew(el: Element): Promise<void>;
  openEdit(annotationId: string): void;
  change(patch: Partial<NoteDraft>): void;
  move(pos: Position): void;
  save(): Promise<void>;
  cancel(): void;
  remove(): Promise<void>;
  minimize(): void;
  restore(): void;
  closeEditor(annotationId: string): void;
  hover(on: boolean): void;
  start(): void;
  resume(): void;
};

type Open = Omit<NoteSession, 'number'>;

const BUSY = 'Finish or cancel the open note first';
const EMPTY_HEADING: NoteHeading = { title: '', tag: '', detail: '' };

function numberIn(page: PageState, note: NoteDraft): number | null {
  if (note.mode === 'new') return page.nextNumber;
  return page.annotations.find((a) => a.id === note.annotationId)?.number ?? null;
}

function tupleKey(t: PendingNoteInput | null): string {
  return JSON.stringify(t);
}

export function createNoteController(deps: NoteControllerDeps): NoteController {
  const { state } = deps;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => Date.now());
  const [open, setOpen] = createSignal<Open | null>(null);
  const [number, setNumber] = createSignal(0);
  let seq = 0;
  let sentKey = tupleKey(null);
  let lastSent: PendingNoteInput | null = null;

  const session = createMemo<NoteSession | null>(() => {
    const s = open();
    return s ? { ...s, number: number() } : null;
  });

  const tuple = createMemo<PendingNoteInput | null>(() => {
    const s = session();
    if (!s) return null;
    return {
      annotationId: s.note.annotationId,
      number: s.number,
      intent: s.note.intent,
      state: pillState(s.note),
      minimized: s.note.minimized,
    };
  });

  const current = (key: string) => open()?.key === key;

  const patch = (key: string, fn: (s: Open) => Open) => {
    const s = open();
    if (s?.key === key) setOpen(fn(s));
  };

  const patchNote = (fn: (n: NoteDraft) => NoteDraft) => {
    const s = open();
    if (s) setOpen({ ...s, note: fn(s.note) });
  };

  const close = () => {
    setOpen(null);
    state.setNoteOpen(false);
  };

  const send = async (t: PendingNoteInput | null) => {
    lastSent = t;
    const key = open()?.key;
    let result: PendingResult;
    try {
      result = await deps.setPendingNote(t);
    } catch {
      return;
    }
    if (t === null || result.ok || result.reason !== 'pending_elsewhere') return;
    if (key !== undefined && current(key)) {
      close();
      state.announce(BUSY);
    }
  };

  const begin = (s: Open, n: number) => {
    setNumber(n);
    setOpen(s);
    state.setNoteOpen(true);
  };

  const busy = (annotationId: string | null): boolean => {
    const s = open();
    if (!s) return false;
    if (s.note.minimized) patchNote((n) => ({ ...n, minimized: false }));
    if (annotationId === null || s.note.annotationId !== annotationId) state.announce(BUSY);
    else if (s.note.minimized) state.announce('Note restored');
    return true;
  };

  createEffect(() => {
    const t = tuple();
    const key = tupleKey(t);
    if (key === sentKey) return;
    sentKey = key;
    untrack(() => void send(t));
  });

  createEffect(
    on(
      state.page,
      (page) => {
        const s = open();
        if (!s) return;
        const n = numberIn(page, s.note);
        if (n === null) {
          close();
          return;
        }
        setNumber(n);
        if (page.pending === null && lastSent !== null) void send(lastSent);
      },
      { defer: true },
    ),
  );

  const announceAndClose = (text: string) => {
    close();
    state.announce(text);
  };

  const finish = (
    key: string,
    result: DispatchResult,
    intent: NoteDraft['intent'],
    text: string,
  ) => {
    if (result.ok) {
      if (current(key)) close();
      state.announce(text);
      return;
    }
    const error = rejectionText(result.reason, intent);
    patch(key, (o) => ({ ...o, note: { ...o.note, error } }));
  };

  return {
    session,
    async openNew(el) {
      if (busy(null)) return;
      const key = String(++seq);
      begin(
        {
          key,
          note: newNote(),
          heading: EMPTY_HEADING,
          target: el,
          capture: null,
          pos: null,
        },
        state.page().nextNumber,
      );
      const captured = await deps.capture(el);
      patch(key, (s) => ({
        ...s,
        capture: captured,
        heading: noteHeading({
          component: componentName(captured),
          elementTag: elementTag(captured),
          elementLabel: elementLabel(captured),
        }),
        pos: initialPosition(el.getBoundingClientRect(), deps.viewport()),
      }));
    },
    openEdit(annotationId) {
      if (busy(annotationId)) return;
      const a = state.page().annotations.find((x) => x.id === annotationId);
      if (!a) return;
      const target = deps.locate(a.selector);
      begin(
        {
          key: String(++seq),
          note: editNote(a),
          heading: noteHeading(a),
          target,
          capture: null,
          pos: initialPosition(target?.getBoundingClientRect() ?? null, deps.viewport()),
        },
        a.number,
      );
    },
    change(p) {
      patchNote((n) => ({ ...n, error: null, ...p }));
    },
    move(pos) {
      const s = open();
      if (s) setOpen({ ...s, pos });
    },
    async save() {
      const s = session();
      if (!s) return;
      const { note } = s;
      const invalid = validate(note);
      if (invalid !== null) {
        patchNote((n) => ({ ...n, error: invalid }));
        return;
      }
      let event: DraftEvent;
      if (note.mode === 'new') {
        if (!s.capture) return;
        event = {
          type: 'annotation.add',
          annotation: {
            id: newId(),
            intent: note.intent,
            priority: note.priority,
            comment: note.comment.trim(),
            capture: s.capture,
            createdAt: now(),
          },
        };
      } else {
        event = {
          type: 'annotation.update',
          id: note.annotationId ?? '',
          intent: note.intent,
          priority: note.priority,
          comment: note.comment.trim(),
        };
      }
      const result = await deps.dispatch(event);
      const text = note.mode === 'new' ? `Annotation ${s.number} added` : 'Annotation updated';
      finish(s.key, result, note.intent, text);
    },
    cancel() {
      const s = open();
      if (!s) return;
      announceAndClose(s.note.mode === 'new' ? 'Annotation cancelled' : 'Note closed');
    },
    async remove() {
      const s = session();
      if (s?.note.mode !== 'edit' || s.note.annotationId === null) return;
      const result = await deps.dispatch({ type: 'annotation.delete', id: s.note.annotationId });
      finish(s.key, result, s.note.intent, `Annotation ${s.number} deleted`);
    },
    minimize() {
      if (!open()) return;
      patchNote((n) => ({ ...n, minimized: true }));
      state.announce('Note minimized');
    },
    restore() {
      if (!open()) return;
      patchNote((n) => ({ ...n, minimized: false }));
      state.announce('Note restored');
    },
    closeEditor(annotationId) {
      const s = open();
      if (s?.note.mode === 'edit' && s.note.annotationId === annotationId) close();
    },
    hover(active) {
      const s = open();
      if (s?.note.mode !== 'edit') return;
      state.setLinked(active ? s.note.annotationId : null, true);
    },
    start() {
      if (state.page().pending !== null) void send(null);
    },
    resume() {
      void send(untrack(tuple));
    },
  };
}
