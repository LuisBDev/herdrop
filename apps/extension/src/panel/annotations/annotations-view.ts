import type { Draft, Priority } from '../../draft/model.ts';
import { normalizeUrl } from '../../draft/url.ts';
import { componentName, elementLabel } from '../../render/label.ts';

export type PriorityClass = 'prio-blocking' | 'prio-important' | 'prio-suggestion';

export type Item = {
  id: string;
  number: number;
  what: string;
  element: string;
  intent: string;
  priority: Priority | null;
  priorityClass: PriorityClass | null;
  comment: string;
  otherPage: boolean;
  offScreen: boolean;
  editable: boolean;
  editTip: string;
};

export type Group = { page: string; label: string; items: Item[] };

export type AnnotationsView = { count: string; groups: Group[] };

function pageOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + parsed.pathname;
  } catch {
    return url;
  }
}

function countOf(draft: Draft): string {
  if (draft.phase === 'no_destination') return '';
  return draft.annotations.length === 0 ? 'Empty' : String(draft.annotations.length);
}

export function annotationsView(
  draft: Draft,
  targetUrl: string | null,
  offscreen: ReadonlySet<string>,
): AnnotationsView {
  const target = targetUrl === null ? null : normalizeUrl(targetUrl);
  const groups = new Map<string, Group>();
  draft.annotations.forEach((annotation, index) => {
    const { capture } = annotation;
    const url = capture.page.url;
    const page = pageOf(url);
    const otherPage = target !== url;
    const item: Item = {
      id: annotation.id,
      number: index + 1,
      what: componentName(capture) ?? 'No component detected',
      element: elementLabel(capture),
      intent: annotation.intent,
      priority: annotation.priority,
      priorityClass: annotation.priority ? `prio-${annotation.priority}` : null,
      comment: annotation.comment || 'No comment',
      otherPage,
      offScreen: !otherPage && offscreen.has(annotation.id),
      editable: !otherPage && draft.phase === 'drafting',
      editTip: otherPage ? `Open ${page} to edit` : 'Edit on the page',
    };
    const group = groups.get(url) ?? { page, label: `Annotations on ${page}`, items: [] };
    group.items.push(item);
    groups.set(url, group);
  });
  return { count: countOf(draft), groups: [...groups.values()] };
}

export function undoView(draft: Draft): { id: string; text: string } | null {
  if (draft.phase !== 'drafting' || !draft.undo) return null;
  return {
    id: draft.undo.annotation.id,
    text: `Annotation ${draft.undo.index + 1} deleted`,
  };
}
