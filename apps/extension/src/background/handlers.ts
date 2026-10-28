import { browser } from 'wxt/browser';
import type { DispatchResult, DraftEvent } from '../draft/model.ts';
import type { DraftStore } from '../draft/store.ts';
import type { PageState, PendingNoteInput, PendingResult } from '../messaging/types.ts';
import { draftItem, targetTabItem, uiItem } from '../storage/items.ts';
import { pageStateFor } from './page-state.ts';

export type SenderTab = { id?: number | undefined; url?: string | undefined };

export type WorkerHandlers = {
  dispatch(event: DraftEvent): Promise<DispatchResult>;
  pageState(url: string, senderTabId: number | undefined): Promise<PageState>;
  setPendingNote(
    note: PendingNoteInput | null,
    senderTab: SenderTab | undefined,
  ): Promise<PendingResult>;
  setSelect(on: boolean): Promise<void>;
  armGrab(): Promise<void>;
  tabLoading(tabId: number): Promise<void>;
  tabRemoved(tabId: number): Promise<void>;
  dropPending(): Promise<void>;
  dropOrphanedPending(): Promise<void>;
  command(name: string): Promise<void>;
};

export function createHandlers(
  store: DraftStore,
  sendToTab: (tabId: number, type: 'armGrab') => Promise<void>,
): WorkerHandlers {
  const armGrab = async () => {
    const [ui, target] = await Promise.all([uiItem.getValue(), targetTabItem.getValue()]);
    if (ui.pending !== null || target === null) return;
    try {
      await sendToTab(target.id, 'armGrab');
    } catch {
      return;
    }
  };

  return {
    dispatch: (event) => store.dispatch(event),
    pageState: async (url, senderTabId) => {
      const [draft, ui] = await Promise.all([draftItem.getValue(), uiItem.getValue()]);
      return pageStateFor({ id: senderTabId ?? -1, url }, draft, ui);
    },
    setPendingNote: async (note, senderTab) => {
      if (senderTab?.id === undefined) return { ok: false, reason: 'no_tab' };
      return store.setPendingNote(senderTab.id, senderTab.url ?? '', note);
    },
    setSelect: (on) => store.setSelect(on),
    armGrab,
    tabLoading: (tabId) => store.clearPendingForTab(tabId),
    tabRemoved: (tabId) => store.clearPendingForTab(tabId),
    dropPending: async () => {
      const { pending } = await uiItem.getValue();
      if (pending !== null) await store.clearPendingForTab(pending.tabId);
    },
    dropOrphanedPending: async () => {
      const { pending } = await uiItem.getValue();
      if (pending === null) return;
      const tab = await browser.tabs.get(pending.tabId).catch(() => undefined);
      if (tab === undefined || tab.discarded) await store.clearPendingForTab(pending.tabId);
    },
    command: async (name) => {
      if (name === 'toggle-select') await store.toggleSelect();
      else if (name === 'start-grab') await armGrab();
    },
  };
}
