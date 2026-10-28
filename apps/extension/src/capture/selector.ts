import { stableClasses } from './classes';

const READABLE_ANCESTORS = 5;

function tagOf(el: Element): string {
  return el.tagName.toLowerCase();
}

function matchesOnly(root: ParentNode, selector: string, el: Element): boolean {
  const found = root.querySelectorAll(selector);
  return found.length === 1 && found[0] === el;
}

function siblingIndex(el: Element, sameTagOnly: boolean): number {
  let index = 1;
  for (let sibling = el.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (!sameTagOnly || sibling.tagName === el.tagName) index += 1;
  }
  return index;
}

function stableIdSelector(el: Element): string | null {
  const id = el.id;
  if (!id || /\d{4,}/.test(id)) return null;
  const selector = `#${CSS.escape(id)}`;
  return el.ownerDocument.querySelectorAll(selector).length === 1 ? selector : null;
}

function selectorPart(el: Element): string {
  const [first] = stableClasses(el);
  const cls = first ? `.${CSS.escape(first)}` : '';
  return `${tagOf(el)}${cls}:nth-of-type(${siblingIndex(el, true)})`;
}

export function uniqueSelector(el: Element): string {
  const byId = stableIdSelector(el);
  if (byId) return byId;
  const parts: string[] = [];
  let current: Element | null = el;
  while (current) {
    parts.unshift(selectorPart(current));
    const selector = parts.join(' > ');
    if (matchesOnly(el.ownerDocument, selector, el) || tagOf(current) === 'body') return selector;
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function readablePart(el: Element): string {
  const [first] = stableClasses(el);
  return first ? `${tagOf(el)}.${first}` : tagOf(el);
}

export function readablePath(el: Element): string {
  const parts = [readablePart(el)];
  let current = el.parentElement;
  while (current && parts.length <= READABLE_ANCESTORS) {
    parts.unshift(readablePart(current));
    current = current.parentElement;
  }
  return parts.join(' > ');
}

export function domPath(el: Element): string {
  const parts: string[] = [];
  for (let current: Element | null = el; current; current = current.parentElement) {
    parts.unshift(`${tagOf(current)}:nth-child(${siblingIndex(current, false)})`);
  }
  return parts.join(' > ');
}
