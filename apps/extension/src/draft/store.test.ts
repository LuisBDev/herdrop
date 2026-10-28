import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Capture } from '../capture/types.ts';
import { createSerial } from '../lib/serial.ts';
import type { PendingNoteInput, UiState } from '../messaging/types.ts';
import { draftItem, uiItem } from '../storage/items.ts';
import type { Annotation, Destination, Draft } from './model.ts';
import { createDraftStore } from './store.ts';

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

const note: PendingNoteInput = {
  annotationId: null,
  number: 3,
  intent: 'change',
  state: 'unsaved',
  minimized: false,
};

const pageUrl = 'http://localhost:4200/dashboard';

function annotation(id: string, comment = 'make it bigger'): Annotation {
  return { id, intent: 'change', priority: null, comment, capture: {} as Capture, createdAt: 0 };
}

function recording() {
  const seen: { draft: Draft; ui: UiState }[] = [];
  const store = createDraftStore({
    onCommitted: async (draft, ui) => {
      seen.push({ draft, ui });
    },
  });
  return { store, seen };
}

const ids = (draft: Draft) => draft.annotations.map((a) => a.id);

beforeEach(() => {
  fakeBrowser.reset();
});

describe('draft store', () => {
  it('serial_runs_in_order_and_survives_a_rejection', async () => {
    const serial = createSerial();
    const finished: string[] = [];
    const results = await Promise.allSettled([
      serial(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        finished.push('slow');
        return 'slow';
      }),
      serial(async () => {
        finished.push('boom');
        throw new Error('boom');
      }),
      serial(async () => {
        finished.push('next');
        return 'next';
      }),
    ]);
    expect(finished).toEqual(['slow', 'boom', 'next']);
    expect(
      results.map((r) => (r.status === 'fulfilled' ? r.value : (r.reason as Error).message)),
    ).toEqual(['slow', 'boom', 'next']);
  });

  it('concurrent_writes_all_persist_in_commit_order', async () => {
    const { store, seen } = recording();
    await store.dispatch({ type: 'destination.pick', destination });
    await store.dispatch({ type: 'annotation.add', annotation: annotation('C') });
    const before = seen.length;

    await Promise.all([
      store.dispatch({ type: 'annotation.add', annotation: annotation('A') }),
      store.dispatch({ type: 'annotation.add', annotation: annotation('B') }),
      store.dispatch({ type: 'annotation.delete', id: 'C' }),
      store.setSelect(false),
      store.setPendingNote(1, pageUrl, note),
    ]);

    expect(ids(await draftItem.getValue())).toEqual(['A', 'B']);
    expect(await uiItem.getValue()).toEqual({
      selectOn: false,
      pending: { ...note, tabId: 1, url: pageUrl },
    });
    expect(
      seen
        .slice(before)
        .map(({ draft, ui }) => [ids(draft).join(''), ui.selectOn, ui.pending?.tabId ?? null]),
    ).toEqual([
      ['CA', true, null],
      ['CAB', true, null],
      ['AB', true, null],
      ['AB', false, null],
      ['AB', false, 1],
    ]);
  });

  it('store_rules_table', async () => {
    const { store, seen } = recording();

    await store.dispatch({ type: 'destination.pick', destination });
    expect((await uiItem.getValue()).selectOn).toBe(true);

    const commits = seen.length;
    const stored = await draftItem.getValue();
    expect(
      await store.dispatch({ type: 'annotation.add', annotation: annotation('X', ' ') }),
    ).toEqual({ ok: false, reason: 'comment_required' });
    expect(await draftItem.getValue()).toEqual(stored);
    expect(seen.length).toBe(commits);

    expect(await store.setPendingNote(1, pageUrl, note)).toEqual({ ok: true });
    expect(await store.dispatch({ type: 'send.start', clientRequestId: 'req-1' })).toEqual({
      ok: false,
      reason: 'note_pending',
    });
    expect(await store.setPendingNote(2, pageUrl, note)).toEqual({
      ok: false,
      reason: 'pending_elsewhere',
    });
    await store.setPendingNote(2, pageUrl, null);
    expect((await uiItem.getValue()).pending?.tabId).toBe(1);
    await store.clearPendingForTab(1);
    expect((await uiItem.getValue()).pending).toBeNull();

    await store.dispatch({ type: 'destination.clear' });
    expect((await uiItem.getValue()).selectOn).toBe(false);
    await store.setSelect(false);
    await store.setSelect(true);
    expect((await uiItem.getValue()).selectOn).toBe(false);
    await store.toggleSelect();
    expect((await uiItem.getValue()).selectOn).toBe(false);
  });
});
