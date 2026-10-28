import { beforeEach, describe, expect, it } from 'vitest';
import { accessibleName, accessibleRole } from './a11y';
import { sanitizedHtml } from './html';

function mount(markup: string): HTMLElement {
  document.body.innerHTML = markup;
  return document.body;
}

describe('sanitizedHtml', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('sanitized_html_drops_scripts_and_attributes_and_is_capped', () => {
    const root = mount(
      '<div id="card" class="c" onclick="x()" style="color:red" value="v" data-herdrop-inspect="1" aria-label="Card" data-testid="card"><script>alert(1)</script><span>hi</span></div>',
    );
    const html = sanitizedHtml(root.querySelector('#card') as Element);
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('style');
    expect(html).not.toContain('value');
    expect(html).not.toContain('data-herdrop-inspect');
    expect(html).toContain('aria-label="Card"');
    expect(html).toContain('data-testid="card"');

    const long = mount(`<div>${'x'.repeat(5000)}</div>`);
    const capped = sanitizedHtml(long.firstElementChild as Element);
    expect(capped).toHaveLength(4000);
    expect(capped.endsWith('…')).toBe(true);
  });
});

describe('accessibleRole and accessibleName', () => {
  it('role_and_name_table', () => {
    const root = mount(
      [
        '<button id="b">  Save   now </button>',
        '<a id="a" href="/x">Docs</a>',
        '<label for="e">Email</label><input id="e" type="text">',
        '<label>Phone <input id="p" type="text"></label>',
        '<span id="l1">First</span><span id="l2">Last</span><input id="n" aria-labelledby="l1 l2">',
        '<p id="para">Just text</p>',
      ].join(''),
    );
    const get = (id: string) => root.querySelector(`#${id}`) as Element;
    const rows = [
      ['b', 'button', 'Save now'],
      ['a', 'link', 'Docs'],
      ['e', 'textbox', 'Email'],
      ['p', 'textbox', 'Phone'],
      ['n', 'textbox', 'First Last'],
      ['para', null, 'Just text'],
    ] as const;
    for (const [id, role, name] of rows) {
      expect([id, accessibleRole(get(id)), accessibleName(get(id))]).toEqual([id, role, name]);
    }
  });
});
