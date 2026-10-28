const HEADING = /^h[1-6]$/;
const TEXT_NAMED = new Set(['button', 'a', 'p', 'span', 'td', 'li']);

function clean(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

export function accessibleRole(el: Element): string | null {
  const explicit = clean(el.getAttribute('role'))?.split(' ')[0];
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (HEADING.test(tag)) return 'heading';
  switch (tag) {
    case 'button':
      return 'button';
    case 'a':
      return el.hasAttribute('href') ? 'link' : null;
    case 'input':
      return el.getAttribute('type')?.toLowerCase() === 'checkbox' ? 'checkbox' : 'textbox';
    case 'select':
      return 'combobox';
    case 'textarea':
      return 'textbox';
    case 'img':
      return 'img';
    case 'nav':
      return 'navigation';
    case 'main':
      return 'main';
    case 'table':
      return 'table';
    case 'tr':
      return 'row';
    case 'li':
      return 'listitem';
    case 'ul':
    case 'ol':
      return 'list';
    case 'section':
      return el.hasAttribute('aria-label') ? 'region' : null;
    case 'form':
      return 'form';
    default:
      return null;
  }
}

function labelledBy(el: Element): string | null {
  const ids = clean(el.getAttribute('aria-labelledby'))?.split(' ') ?? [];
  const texts = ids.map((id) => clean(el.ownerDocument.getElementById(id)?.textContent));
  return clean(texts.filter((text): text is string => text !== null).join(' '));
}

function labelText(el: Element): string | null {
  const id = el.getAttribute('id');
  if (id) {
    for (const label of Array.from(el.ownerDocument.querySelectorAll('label'))) {
      if (label.getAttribute('for') === id) {
        const text = clean(label.textContent);
        if (text) return text;
      }
    }
  }
  return clean(el.closest('label')?.textContent);
}

export function accessibleName(el: Element): string | null {
  const direct =
    labelledBy(el) ??
    clean(el.getAttribute('aria-label')) ??
    labelText(el) ??
    clean(el.getAttribute('alt')) ??
    clean(el.getAttribute('title')) ??
    clean(el.getAttribute('placeholder'));
  if (direct) return direct;
  const tag = el.tagName.toLowerCase();
  return TEXT_NAMED.has(tag) || HEADING.test(tag) ? clean(el.textContent) : null;
}
