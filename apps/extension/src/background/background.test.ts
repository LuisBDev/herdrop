import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Capture } from '../capture/types.ts';
import { initialDraft } from '../draft/machine.ts';
import type { Destination, Draft } from '../draft/model.ts';
import { createDraftStore } from '../draft/store.ts';
import type { PageState, PendingNoteInput, UiState } from '../messaging/types.ts';
import { draftItem, targetTabItem, uiItem } from '../storage/items.ts';
import { createBroadcast } from './broadcast.ts';
import { createHandlers } from './handlers.ts';
import { onTabActivated } from './target-tab.ts';

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
  number: 2,
  intent: 'change',
  state: 'unsaved',
  minimized: false,
};

const drafting: Draft = {
  phase: 'drafting',
  destination,
  annotations: [
    { id: 'a1', intent: 'fix', priority: null, comment: 'x', capture: {} as Capture, createdAt: 0 },
  ],
  undo: null,
  lastDelivery: null,
};

function handlersWith(sent: number[] = []) {
  const store = createDraftStore({ onCommitted: async () => {} });
  const handlers = createHandlers(store, async (tabId) => {
    sent.push(tabId);
  });
  return handlers;
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('service worker', () => {
  it('target_tab_ignores_extension_pages', async () => {
    fakeBrowser.tabs.onActivated.addListener(onTabActivated);
    const web = await fakeBrowser.tabs.create({ url: 'http://localhost:4310/' });
    await fakeBrowser.tabs.onActivated.trigger({ tabId: web.id ?? -1, windowId: web.windowId });
    const panel = await fakeBrowser.tabs.create({ url: 'chrome-extension://abc/sidepanel.html' });
    await fakeBrowser.tabs.onActivated.trigger({ tabId: panel.id ?? -1, windowId: panel.windowId });

    expect(await targetTabItem.getValue()).toEqual({ id: web.id, url: 'http://localhost:4310/' });
  });

  it('pending_note_cleanup_table', async () => {
    await draftItem.setValue(drafting);
    const handlers = handlersWith();
    const owner = { id: 3, url: 'http://localhost:4310/' };

    expect(await handlers.setPendingNote(note, owner)).toEqual({ ok: true });
    await handlers.tabLoading(3);
    expect((await uiItem.getValue()).pending).toBeNull();
    expect(await handlers.dispatch({ type: 'send.start', clientRequestId: 'r1' })).toMatchObject({
      ok: true,
    });

    await handlers.setPendingNote(note, owner);
    await handlers.tabLoading(4);
    expect((await uiItem.getValue()).pending).toMatchObject({ tabId: 3 });
    await handlers.tabRemoved(3);
    expect((await uiItem.getValue()).pending).toBeNull();

    const live = await fakeBrowser.tabs.create({ url: 'http://localhost:4310/' });
    await handlers.setPendingNote(note, { id: live.id, url: live.url });
    await handlers.dropOrphanedPending();
    expect((await uiItem.getValue()).pending).toMatchObject({ tabId: live.id });
    await handlers.tabRemoved(live.id ?? -1);
    await handlers.setPendingNote(note, owner);
    await handlers.dropOrphanedPending();
    expect((await uiItem.getValue()).pending).toBeNull();
  });

  it('broadcast_sends_each_http_tab_its_own_state', async () => {
    const owner = await fakeBrowser.tabs.create({ url: 'http://localhost:4310/a' });
    const other = await fakeBrowser.tabs.create({ url: 'https://example.com/' });
    await fakeBrowser.tabs.create({ url: 'chrome://extensions/' });
    const calls = new Map<number, PageState>();
    const broadcast = createBroadcast(async (tabId, state) => {
      calls.set(tabId, state);
      if (tabId === owner.id) throw new Error('no receiver');
    });
    const ui: UiState = {
      selectOn: true,
      pending: { ...note, tabId: owner.id ?? -1, url: 'http://localhost:4310/a' },
    };

    await expect(broadcast(initialDraft, ui)).resolves.toBeUndefined();
    expect([...calls.keys()].sort()).toEqual([owner.id, other.id].sort());
    expect(calls.get(owner.id ?? -1)?.pending).toEqual(note);
    expect(calls.get(other.id ?? -1)?.pending).toBeNull();
  });

  it('handler_guards', async () => {
    const sent: number[] = [];
    const handlers = handlersWith(sent);
    await targetTabItem.setValue({ id: 7, url: 'http://localhost:4310/' });

    expect(await handlers.setPendingNote(note, undefined)).toEqual({ ok: false, reason: 'no_tab' });
    await handlers.setPendingNote(note, { id: 7, url: 'http://localhost:4310/' });
    await handlers.command('start-grab');

    expect(sent).toEqual([]);
  });
});
