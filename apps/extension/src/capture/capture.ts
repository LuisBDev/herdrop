import { normalizeUrl } from '../draft/url.ts';
import { truncate } from '../render/label.ts';
import { accessibleName, accessibleRole } from './a11y.ts';
import { BUDGETS, limitList } from './budget.ts';
import { stableClasses } from './classes.ts';
import { sanitizedHtml } from './html.ts';
import { nearbyContext } from './nearby.ts';
import { domPath, readablePath, uniqueSelector } from './selector.ts';
import { pickStyles } from './styles.ts';
import type { Capture, FrameworkInfo } from './types.ts';

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function visibleText(el: Element): string {
  const inner = (el as HTMLElement).innerText;
  return collapse(typeof inner === 'string' && inner !== '' ? inner : (el.textContent ?? ''));
}

function limitedFramework(framework: FrameworkInfo | null): FrameworkInfo | null {
  if (!framework) return null;
  return {
    kind: framework.kind,
    components: limitList(framework.components, BUDGETS.components),
    sourceFile:
      framework.sourceFile === null ? null : truncate(framework.sourceFile, BUDGETS.sourceFile),
  };
}

function optional(value: string | null, max: number): string | null {
  return value === null ? null : truncate(value, max);
}

export function captureElement(
  el: Element,
  opts: { selectedText: string; framework: FrameworkInfo | null },
): Capture {
  const rect = el.getBoundingClientRect();
  return {
    page: {
      url: truncate(normalizeUrl(location.href), BUDGETS.url),
      title: truncate(document.title, BUDGETS.title),
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { x: scrollX, y: scrollY },
      devicePixelRatio,
    },
    target: {
      tag: el.tagName.toLowerCase(),
      selector: truncate(uniqueSelector(el), BUDGETS.selector),
      readablePath: truncate(readablePath(el), BUDGETS.readablePath),
      domPath: truncate(domPath(el), BUDGETS.domPath),
      classes: limitList(stableClasses(el), BUDGETS.classes),
      selectedText: truncate(opts.selectedText, BUDGETS.selectedText),
      visibleText: truncate(visibleText(el), BUDGETS.visibleText),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    },
    html: truncate(sanitizedHtml(el), BUDGETS.html),
    a11y: {
      role: optional(accessibleRole(el), BUDGETS.role),
      name: optional(accessibleName(el), BUDGETS.name),
    },
    styles: pickStyles(el),
    nearby: nearbyContext(el),
    framework: limitedFramework(opts.framework),
  };
}
