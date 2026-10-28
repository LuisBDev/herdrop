const KEPT = new Set([
  'id',
  'class',
  'name',
  'type',
  'role',
  'href',
  'src',
  'alt',
  'title',
  'placeholder',
  'for',
  'disabled',
  'checked',
  'data-testid',
]);
const LIMIT = 4000;

function keepAttribute(name: string): boolean {
  return KEPT.has(name) || name.startsWith('aria-');
}

function strip(el: Element): void {
  for (const script of Array.from(el.querySelectorAll('script'))) script.remove();
  for (const node of [el, ...Array.from(el.querySelectorAll('*'))]) {
    for (const attr of Array.from(node.attributes)) {
      if (!keepAttribute(attr.name)) node.removeAttribute(attr.name);
    }
  }
}

export function sanitizedHtml(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  strip(clone);
  const html = clone.outerHTML.replace(/\s+/g, ' ');
  return html.length > LIMIT ? `${html.slice(0, LIMIT - 1)}…` : html;
}
