import { expect, it } from 'vitest';
import { createChildStack, fromEvent, labelPosition, labelText, parentOf } from './selection';

function mount(html: string): void {
  document.body.innerHTML = html;
}

function byId(id: string): Element {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing ${id}`);
  return el;
}

it('event_inside_overlay_host_is_ignored', () => {
  mount('<div id="host"><span id="inner"></span></div><p id="page"></p>');
  const host = byId('host');
  const seen: Array<Element | null> = [];
  document.addEventListener('click', (event) => seen.push(fromEvent(event, host)), {
    once: true,
  });
  byId('inner').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  document.addEventListener('click', (event) => seen.push(fromEvent(event, host)), {
    once: true,
  });
  byId('page').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  expect(seen[0]).toBeNull();
  expect(seen[1]).toBe(byId('page'));
});

it('parent_and_child_walk', () => {
  mount('<section id="a"><div id="b"><span id="c"></span></div></section>');
  const a = byId('a');
  const b = byId('b');
  const c = byId('c');
  expect(parentOf(a)).toBeNull();
  const stack = createChildStack();
  expect(stack.up(c)).toBe(b);
  expect(stack.up(b)).toBe(a);
  expect(stack.up(a)).toBeNull();
  expect(stack.down(a)).toBe(b);
  expect(stack.down(b)).toBe(c);
  expect(stack.down(c)).toBeNull();
  stack.up(c);
  stack.reset();
  expect(stack.down(b)).toBe(c);
});

it('label_uses_first_stable_class_and_component', () => {
  mount('<button id="x" class="css-1abc9 primary big"></button><i id="y"></i>');
  expect(labelText(byId('x'), 'SaveButton')).toEqual({
    tag: 'button.primary',
    component: 'SaveButton',
  });
  expect(labelText(byId('y'), null)).toEqual({ tag: 'i', component: null });
});

it('label_position', () => {
  const rect = (x: number, y: number, w: number, h: number) =>
    ({ x, y, width: w, height: h }) as DOMRect;
  const viewport = { width: 500 };
  const rows = [
    { rect: rect(100, 100, 50, 20), expected: { left: 97, top: 69 } },
    { rect: rect(100, 20, 50, 20), expected: { left: 97, top: 46 } },
    { rect: rect(450, 100, 40, 20), expected: { left: 376, top: 69 } },
  ];
  for (const row of rows) {
    expect(labelPosition(row.rect, 120, viewport)).toEqual(row.expected);
  }
});
