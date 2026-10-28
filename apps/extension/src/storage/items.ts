import { storage } from 'wxt/utils/storage';
import { initialDraft } from '../draft/machine.ts';
import type { Draft } from '../draft/model.ts';
import type { Settings, TargetTab, UiState } from '../messaging/types.ts';

export const draftItem = storage.defineItem<Draft>('session:draft', { fallback: initialDraft });
export const uiItem = storage.defineItem<UiState>('session:ui', {
  fallback: { selectOn: false, pending: null },
});
export const targetTabItem = storage.defineItem<TargetTab | null>('session:targetTab', {
  fallback: null,
});
export const settingsItem = storage.defineItem<Settings>('local:settings', { fallback: {} });
export const reloadedForVersionItem = storage.defineItem<string | null>(
  'local:reloadedForVersion',
  { fallback: null },
);
