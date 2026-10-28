import { truncate } from '../render/label.ts';
import { BUDGETS } from './budget.ts';
import type { StyleKey } from './types.ts';

const SOURCES: Record<StyleKey, keyof CSSStyleDeclaration> = {
  display: 'display',
  position: 'position',
  width: 'width',
  height: 'height',
  margin: 'margin',
  padding: 'padding',
  color: 'color',
  background: 'backgroundColor',
  border: 'border',
  borderRadius: 'borderRadius',
  font: 'font',
  lineHeight: 'lineHeight',
  textAlign: 'textAlign',
  zIndex: 'zIndex',
};

export function pickStyles(el: Element): Record<StyleKey, string> {
  const computed = getComputedStyle(el);
  const out = {} as Record<StyleKey, string>;
  for (const key of Object.keys(SOURCES) as StyleKey[]) {
    out[key] = truncate(String(computed[SOURCES[key]] ?? ''), BUDGETS.style);
  }
  return out;
}
