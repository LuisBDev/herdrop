import { BUDGETS, limitList } from './budget.ts';
import { stableClasses } from './classes.ts';
import type { Capture } from './types.ts';

function tagged(el: Element): string {
  const first = stableClasses(el)[0];
  const tag = el.tagName.toLowerCase();
  return first ? `${tag}.${first}` : tag;
}

function flatText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function ancestorsOf(el: Element): string[] {
  const out: string[] = [];
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    out.push(tagged(node));
    if (node === document.body) break;
    node = node.parentElement;
  }
  return out;
}

function siblingsByDistance(el: Element): Element[] {
  const parent = el.parentElement;
  if (!parent) return [];
  const all = Array.from(parent.children);
  const index = all.indexOf(el);
  return all
    .map((node, i) => ({ node, distance: Math.abs(i - index), i }))
    .filter((entry) => entry.node !== el)
    .sort((a, b) => a.distance - b.distance || a.i - b.i)
    .map((entry) => entry.node);
}

export function nearbyContext(el: Element): Capture['nearby'] {
  const elements = [el.previousElementSibling, el.nextElementSibling]
    .filter((node): node is Element => node !== null)
    .map(tagged);
  const text = siblingsByDistance(el)
    .map(flatText)
    .filter((value) => value !== '');
  return {
    text: limitList(text, BUDGETS.nearbyText),
    elements: limitList(elements, BUDGETS.nearbyElements),
    ancestors: limitList(ancestorsOf(el), BUDGETS.ancestors),
  };
}
