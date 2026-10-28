import { stableClasses } from '../capture/classes';

export function fromEvent(event: Event, host: Element): Element | null {
  const path = event.composedPath();
  if (path.includes(host)) return null;
  return path.find((node): node is Element => node instanceof Element) ?? null;
}

export function parentOf(el: Element): Element | null {
  const parent = el.parentElement;
  if (!parent || parent === document.body || parent === document.documentElement) return null;
  return parent;
}

export function createChildStack() {
  const stack: Element[] = [];
  return {
    up(current: Element): Element | null {
      const parent = parentOf(current);
      if (parent) stack.push(current);
      return parent;
    },
    down(current: Element): Element | null {
      const popped = stack.pop();
      if (popped && current.contains(popped)) return popped;
      return current.firstElementChild;
    },
    reset(): void {
      stack.length = 0;
    },
  };
}

export function labelText(
  el: Element,
  component: string | null,
): { tag: string; component: string | null } {
  const tag = el.tagName.toLowerCase();
  const first = stableClasses(el)[0];
  return { tag: first ? `${tag}.${first}` : tag, component };
}

export function selectedText(): string {
  return window.getSelection()?.toString() ?? '';
}

export function boxRect(rect: DOMRect) {
  return { left: rect.x - 3, top: rect.y - 3, width: rect.width + 6, height: rect.height + 6 };
}

export function labelPosition(rect: DOMRect, labelWidth: number, viewport: { width: number }) {
  const above = rect.y - 31;
  return {
    left: Math.max(4, Math.min(rect.x - 3, viewport.width - labelWidth - 4)),
    top: above >= 4 ? above : rect.y + rect.height + 6,
  };
}
