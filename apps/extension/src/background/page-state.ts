import { annotationNumber } from '../draft/machine.ts';
import type { Annotation, Draft } from '../draft/model.ts';
import { normalizeUrl } from '../draft/url.ts';
import type {
  PageAnnotation,
  PageState,
  PendingNoteInput,
  TargetTab,
  UiState,
} from '../messaging/types.ts';
import { componentName, elementLabel, elementTag } from '../render/label.ts';

function toPageAnnotation(draft: Draft, annotation: Annotation): PageAnnotation {
  const { id, intent, priority, comment, capture } = annotation;
  return {
    id,
    number: annotationNumber(draft, id) ?? 0,
    intent,
    priority,
    comment,
    selector: capture.target.selector,
    component: componentName(capture),
    elementTag: elementTag(capture),
    elementLabel: elementLabel(capture),
  };
}

export function pageStateFor(tab: TargetTab, draft: Draft, ui: UiState): PageState {
  const url = normalizeUrl(tab.url);
  let pending: PendingNoteInput | null = null;
  if (ui.pending !== null && ui.pending.tabId === tab.id) {
    const { tabId: _tabId, url: _url, ...input } = ui.pending;
    pending = input;
  }
  return {
    selectOn: ui.selectOn,
    canSelect: draft.phase === 'drafting',
    nextNumber: draft.annotations.length + 1,
    annotations: draft.annotations
      .filter((a) => a.capture.page.url === url)
      .map((a) => toPageAnnotation(draft, a)),
    pending,
    pendingElsewhere: ui.pending !== null && ui.pending.tabId !== tab.id,
  };
}
