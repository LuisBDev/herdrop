import type { Intent } from '../draft/model.ts';
import type { PageAnnotation } from '../messaging/types.ts';

type Viewport = { width: number; height: number };
export type Marker = { id: string; number: number; intent: Intent; left: number; top: number };

export function locate(selector: string, root: ParentNode = document): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

export function isOffscreen(rect: DOMRect | null, viewport: Viewport): boolean {
  if (!rect) return true;
  if (rect.width === 0 && rect.height === 0) return true;
  return (
    rect.bottom <= 0 ||
    rect.top >= viewport.height ||
    rect.right <= 0 ||
    rect.left >= viewport.width
  );
}

export function layoutMarkers(
  annotations: PageAnnotation[],
  find: (selector: string) => Element | null,
  viewport: Viewport,
  hiddenId: string | null,
): { markers: Marker[]; offscreen: string[] } {
  const markers: Marker[] = [];
  const offscreen: string[] = [];
  for (const a of annotations) {
    const rect = find(a.selector)?.getBoundingClientRect() ?? null;
    if (isOffscreen(rect, viewport)) offscreen.push(a.id);
    if (!rect || a.id === hiddenId) continue;
    markers.push({ id: a.id, number: a.number, intent: a.intent, left: rect.x, top: rect.y });
  }
  return { markers, offscreen };
}

export function sameIds(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((id) => sb.has(id));
}
