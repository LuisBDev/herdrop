import type { DispatchResult, DraftEvent, Intent, Priority } from '../draft/model.ts';

export type NoteState = 'empty' | 'unsaved' | 'unsaved_changes' | 'clean';
export type PendingNoteInput = {
  annotationId: string | null;
  number: number;
  intent: Intent;
  state: NoteState;
  minimized: boolean;
};
export type PendingNote = PendingNoteInput & { tabId: number; url: string };
export type PendingResult = { ok: true } | { ok: false; reason: 'pending_elsewhere' | 'no_tab' };
export type PageAnnotation = {
  id: string;
  number: number;
  intent: Intent;
  priority: Priority | null;
  comment: string;
  selector: string;
  component: string | null;
  elementTag: string;
  elementLabel: string;
};
export type PageState = {
  selectOn: boolean;
  canSelect: boolean;
  nextNumber: number;
  annotations: PageAnnotation[];
  pending: PendingNoteInput | null;
  pendingElsewhere: boolean;
};
export type UiState = { selectOn: boolean; pending: PendingNote | null };
export type TargetTab = { id: number; url: string };
export type Settings = { bridgePort?: number; theme?: 'system' | 'light' | 'dark' };

export interface BackgroundProtocol {
  dispatch(event: DraftEvent): DispatchResult;
  pageState(data: { url: string }): PageState;
  setPendingNote(note: PendingNoteInput | null): PendingResult;
  setSelect(data: { on: boolean }): void;
  armGrab(): void;
  syncSiteAccess(data: { tabId: number | null }): void;
}
export interface TabProtocol {
  pageStateChanged(state: PageState): void;
  armGrab(): void;
  disarmGrab(): void;
  reportVisibility(): void;
  highlightAnnotation(data: { id: string | null }): void;
  openEditor(data: { annotationId: string }): void;
  closeEditor(data: { annotationId: string }): void;
}
export interface PanelProtocol {
  annotationLinked(data: { id: string | null }): void;
  visibilityChanged(data: { url: string; offscreen: string[] }): void;
  grabChanged(data: { armed: boolean }): void;
}
