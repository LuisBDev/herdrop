import { storage } from 'wxt/utils/storage';
import { createSerial } from '../lib/serial.ts';
import type { PendingNoteInput, PendingResult, UiState } from '../messaging/types.ts';
import { draftItem, uiItem } from '../storage/items.ts';
import { reduce } from './machine.ts';
import type { DispatchResult, Draft, DraftEvent } from './model.ts';

export type DraftStore = {
  dispatch(event: DraftEvent): Promise<DispatchResult>;
  setSelect(on: boolean): Promise<void>;
  toggleSelect(): Promise<void>;
  setPendingNote(tabId: number, url: string, note: PendingNoteInput | null): Promise<PendingResult>;
  clearPendingForTab(tabId: number): Promise<void>;
};

type Change<R> = { result: R; draft?: Draft | undefined; ui?: UiState | undefined };

const done: Change<void> = { result: undefined };
const accepted: PendingResult = { ok: true };

function select(draft: Draft, ui: UiState, on: boolean): Change<void> {
  if (on && draft.phase !== 'drafting') return done;
  return { result: undefined, ui: { ...ui, selectOn: on } };
}

function withoutPending(ui: UiState, tabId: number): UiState | undefined {
  return ui.pending?.tabId === tabId ? { ...ui, pending: null } : undefined;
}

export function createDraftStore(deps: {
  onCommitted: (draft: Draft, ui: UiState) => Promise<void>;
}): DraftStore {
  const serial = createSerial();

  const run = <R>(change: (draft: Draft, ui: UiState) => Change<R>): Promise<R> =>
    serial(async () => {
      const [draft, ui] = await Promise.all([draftItem.getValue(), uiItem.getValue()]);
      const next = change(draft, ui);
      const writes = [
        ...(next.draft ? [{ item: draftItem, value: next.draft }] : []),
        ...(next.ui ? [{ item: uiItem, value: next.ui }] : []),
      ];
      if (writes.length === 0) return next.result;
      await storage.setItems(writes);
      await deps.onCommitted(next.draft ?? draft, next.ui ?? ui);
      return next.result;
    });

  return {
    dispatch: (event) =>
      run((draft, ui): Change<DispatchResult> => {
        if (event.type === 'send.start' && ui.pending !== null) {
          return { result: { ok: false, reason: 'note_pending' } };
        }
        const result = reduce(draft, event);
        if (!result.ok) return { result };
        if (event.type === 'destination.pick') {
          return { result, draft: result.draft, ui: { ...ui, selectOn: true } };
        }
        if (event.type === 'destination.clear') {
          return { result, draft: result.draft, ui: { ...ui, selectOn: false } };
        }
        return { result, draft: result.draft };
      }),
    setSelect: (on) => run((draft, ui) => select(draft, ui, on)),
    toggleSelect: () => run((draft, ui) => select(draft, ui, !ui.selectOn)),
    setPendingNote: (tabId, url, note) =>
      run((_draft, ui): Change<PendingResult> => {
        if (note === null) return { result: accepted, ui: withoutPending(ui, tabId) };
        if (ui.pending !== null && ui.pending.tabId !== tabId) {
          return { result: { ok: false, reason: 'pending_elsewhere' } };
        }
        return { result: accepted, ui: { ...ui, pending: { ...note, tabId, url } } };
      }),
    clearPendingForTab: (tabId) =>
      run((_draft, ui) => ({ result: undefined, ui: withoutPending(ui, tabId) })),
  };
}
