import { expect, it } from 'vitest';
import { stableClasses } from './classes';
import { domPath, readablePath, uniqueSelector } from './selector';

function mount(html: string, target: string): Element {
  document.body.innerHTML = html;
  const el = document.querySelector(`[data-target="${target}"]`);
  if (!el) throw new Error(`missing ${target}`);
  return el;
}

it('unique_selector_table', () => {
  const rows = [
    {
      html: '<ul class="list"><li class="row"></li><li class="row"></li><li class="row"></li></ul><ul class="list"><li class="row"></li><li class="row"></li><li class="row" data-target="t"></li></ul>',
      expected: 'ul.list:nth-of-type(2) > li.row:nth-of-type(3)',
    },
    {
      html: '<main><button id="save" class="btn" data-target="t"></button><button class="btn"></button></main>',
      expected: '#save',
    },
    {
      html: '<section><div class="card"></div><div id="row-12345" class="card" data-target="t"></div></section>',
      expected: 'div.card:nth-of-type(2)',
    },
    {
      html: '<div><p class="md:px-4"></p><p class="md:px-4" data-target="t"></p></div>',
      expected: 'p.md\\:px-4:nth-of-type(2)',
    },
    {
      html: '<div><span id="a.b" data-target="t"></span><span></span></div>',
      expected: '#a\\.b',
    },
  ];

  for (const { html, expected } of rows) {
    const el = mount(html, 't');
    const selector = uniqueSelector(el);
    expect(selector).toBe(expected);
    expect(Array.from(document.querySelectorAll(selector))).toEqual([el]);
  }
});

it('stable_classes_table', () => {
  const dropped = [
    'css-1x2y3z',
    'sc-bdfBwQ',
    'jsx-2893',
    'svelte-xyz12',
    'emotion-0',
    'ng-tns-c12-3',
    'Button__root__a1B2c',
    '_3xYz9',
    'a1b2c3d4',
  ];
  const kept = ['btn-primary', 'nav-link', 'active', 'stat-value', 'md:px-4'];
  const el = document.createElement('div');
  el.className = [kept[0], ...dropped, ...kept.slice(1)].join(' ');

  expect(stableClasses(el)).toEqual(kept);
});

it('paths_table', () => {
  const deep = mount(
    '<div class="l1"><div class="l2"><div class="l3"><div class="l4"><div class="l5"><div class="l6"><div class="l7"><span class="l8" data-target="deep"></span></div></div></div></div></div></div></div>',
    'deep',
  );
  expect(readablePath(deep)).toBe('div.l3 > div.l4 > div.l5 > div.l6 > div.l7 > span.l8');

  const leaf = mount(
    '<div><span></span><section><p><em data-target="leaf"></em></p></section></div>',
    'leaf',
  );
  expect(domPath(leaf)).toBe(
    'html:nth-child(1) > body:nth-child(2) > div:nth-child(1) > section:nth-child(2) > p:nth-child(1) > em:nth-child(1)',
  );
});
