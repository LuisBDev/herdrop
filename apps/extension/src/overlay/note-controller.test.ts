import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { Capture } from '../capture/types.ts';
import type { DispatchResult, DraftEvent } from '../draft/model.ts';
import type {
  PageAnnotation,
  PageState,
  PendingNoteInput,
  PendingResult,
} from '../messaging/types.ts';
import { createNoteController } from './note-controller.ts';
import { createOverlayState } from './overlay-state.ts';

vi.mock('solid-js', () => import('solid-js/dist/solid.js' as string));

function annotation(id: string, number: number, selector: string): PageAnnotation {
  return {
    id,
    number,
    intent: 'fix',
    priority: 'important',
    comment: `Comment ${number}`,
    selector,
    component: 'Header',
    elementTag: 'button.save',
    elementLabel: 'button.save button “Save”',
  };
}

const page: PageState = {
  selectOn: true,
  canSelect: true,
  nextNumber: 3,
  annotations: [annotation('a1', 1, '#one'), annotation('a2', 2, '#missing')],
  pending: null,
  pendingElsewhere: false,
};

const framework = { kind: 'react' as const, components: ['App', 'SaveButton'], sourceFile: null };

const capture = {
  target: { tag: 'button', classes: ['save'] },
  a11y: { role: 'button', name: 'Save' },
  framework,
} as unknown as Capture;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(
  opts: { dispatch?: DispatchResult; pending?: PendingResult; start?: PageState } = {},
) {
  const events: DraftEvent[] = [];
  const sent: (PendingNoteInput | null)[] = [];
  const el = document.createElement('button');
  document.body.append(el);
  const state = createOverlayState({
    getPageState: async () => page,
    notifyPanel: async () => {},
    url: () => 'https://example.com/',
  });
  state.applyPageState(opts.start ?? page);
  const controller = createRoot(() =>
    createNoteController({
      state,
      capture: async () => capture,
      dispatch: async (e) => {
        events.push(e);
        return opts.dispatch ?? ({ ok: true } as DispatchResult);
      },
      setPendingNote: async (note) => {
        sent.push(note);
        return opts.pending ?? { ok: true };
      },
      locate: (selector) => (selector === '#one' ? el : null),
      viewport: () => ({ width: 1280, height: 800 }),
      newId: () => 'new-id',
      now: () => 42,
    }),
  );
  return { state, controller, events, sent, el };
}

describe('note controller', () => {
  it('save_outcomes', async () => {
    const cases: {
      name: string;
      dispatch?: DispatchResult;
      act: (t: ReturnType<typeof setup>) => Promise<void>;
      events: DraftEvent[];
      error: string | null;
    }[] = [
      {
        name: 'new note adds the captured annotation',
        act: async ({ controller, el }) => {
          await controller.openNew(el);
          controller.change({ comment: '  Make it blue  ' });
        },
        events: [
          {
            type: 'annotation.add',
            annotation: {
              id: 'new-id',
              intent: 'change',
              priority: null,
              comment: 'Make it blue',
              capture,
              createdAt: 42,
            },
          },
        ],
        error: null,
      },
      {
        name: 'invalid new note dispatches nothing',
        act: async ({ controller, el }) => {
          await controller.openNew(el);
          controller.change({ comment: '   ' });
        },
        events: [],
        error: 'Describe what should change',
      },
      {
        name: 'rejected save shows the rejection',
        dispatch: { ok: false, reason: 'wrong_phase' },
        act: async ({ controller, el }) => {
          await controller.openNew(el);
          controller.change({ comment: 'Make it blue' });
        },
        events: [
          {
            type: 'annotation.add',
            annotation: {
              id: 'new-id',
              intent: 'change',
              priority: null,
              comment: 'Make it blue',
              capture,
              createdAt: 42,
            },
          },
        ],
        error: 'The draft is locked while the drop runs',
      },
      {
        name: 'edit updates the annotation',
        act: async ({ controller }) => {
          controller.openEdit('a1');
          controller.change({ intent: 'question', comment: 'Why red? ' });
        },
        events: [
          {
            type: 'annotation.update',
            id: 'a1',
            intent: 'question',
            priority: 'important',
            comment: 'Why red?',
          },
        ],
        error: null,
      },
    ];
    for (const c of cases) {
      const t = setup(c.dispatch ? { dispatch: c.dispatch } : {});
      await c.act(t);
      await t.controller.save();
      expect(t.events, c.name).toEqual(c.events);
      expect(t.controller.session()?.note.error ?? null, c.name).toBe(c.error);
      expect(t.state.noteOpen(), c.name).toBe(c.error !== null);
    }
    const added = setup();
    await added.controller.openNew(added.el);
    added.controller.change({ comment: 'Blue' });
    await added.controller.save();
    expect(added.state.live()).toBe('Annotation 3 added');
    const event = added.events[0];
    expect(event?.type === 'annotation.add' && event.annotation.capture.framework).toBe(framework);
  });

  it('edit_with_missing_element_opens_top_left_and_closes_when_annotation_disappears', async () => {
    const { state, controller, sent } = setup();
    controller.openEdit('a2');
    expect(controller.session()?.pos).toEqual({ left: 8, top: 8 });
    expect(controller.session()?.target).toBeNull();
    expect(controller.session()?.number).toBe(2);
    state.applyPageState({
      ...page,
      nextNumber: 2,
      annotations: [{ ...annotation('a2', 1, '#missing') }],
    });
    expect(controller.session()?.number).toBe(1);
    state.applyPageState({ ...page, nextNumber: 1, annotations: [] });
    await flush();
    expect(controller.session()).toBeNull();
    expect(state.noteOpen()).toBe(false);
    expect(sent.at(-1)).toBeNull();
  });

  it('only_one_note_at_a_time', async () => {
    const first = setup();
    first.controller.openEdit('a1');
    first.controller.minimize();
    await first.controller.openNew(first.el);
    first.controller.openEdit('a2');
    await flush();
    expect(first.controller.session()?.note.annotationId).toBe('a1');
    expect(first.controller.session()?.note.minimized).toBe(false);
    expect(first.state.live()).toBe('Finish or cancel the open note first');

    const elsewhere = setup({ pending: { ok: false, reason: 'pending_elsewhere' } });
    await elsewhere.controller.openNew(elsewhere.el);
    await flush();
    expect(elsewhere.controller.session()).toBeNull();
    expect(elsewhere.state.noteOpen()).toBe(false);
    expect(elsewhere.events).toEqual([]);
    expect(elsewhere.state.live()).toBe('Finish or cancel the open note first');
  });

  it('pending_note_sync', async () => {
    const { state, controller, sent, el } = setup();
    await controller.openNew(el);
    controller.change({ comment: 'B' });
    controller.change({ comment: 'Bl' });
    controller.change({ comment: 'Blue' });
    const tuple = (s: PendingNoteInput['state']): PendingNoteInput => ({
      annotationId: null,
      number: 3,
      intent: 'change',
      state: s,
      minimized: false,
    });
    expect(sent).toEqual([tuple('empty'), tuple('unsaved')]);
    state.applyPageState({ ...page, pending: tuple('unsaved') });
    state.applyPageState({ ...page, pending: null });
    expect(sent).toEqual([tuple('empty'), tuple('unsaved'), tuple('unsaved')]);
    controller.cancel();
    expect(sent.at(-1)).toBeNull();
    expect(state.live()).toBe('Annotation cancelled');

    const fresh = setup({ start: { ...page, pending: tuple('unsaved') } });
    fresh.controller.start();
    expect(fresh.sent).toEqual([null]);
  });
});
