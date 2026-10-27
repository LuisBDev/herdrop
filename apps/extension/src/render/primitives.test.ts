import { describe, expect, it } from 'vitest';
import type { Capture } from '../capture/types.ts';
import { elementLabel } from './label.ts';
import { fence, inlineCode } from './markdown.ts';
import { redact } from './redact.ts';

function capture(tag: string, classes: string[], role: string | null, name: string | null) {
  return { target: { tag, classes }, a11y: { role, name } } as Capture;
}

describe('renderer primitives', () => {
  it('fence_and_inline_code_table', () => {
    const rows: [string, string][] = [
      [fence('a ``` b'), '````\na ``` b\n````'],
      [fence('plain'), '```\nplain\n```'],
      [inlineCode('a`b'), '``a`b``'],
      [inlineCode('`x'), '`` `x ``'],
      [inlineCode('a\n\n# b'), '`a # b`'],
      [inlineCode('  '), '(empty)'],
    ];
    for (const [actual, expected] of rows) expect(actual).toBe(expected);
  });

  it('redact_table', () => {
    expect(redact('token=abc123 next')).toBe('token=[redacted] next');
    expect(redact('{"password": "hunter2"}')).toBe('{"password": "[redacted]"}');
    const bearer = redact('Authorization: Bearer eyJa.eyJb.c');
    expect(bearer).toContain('[redacted]');
    expect(bearer).not.toContain('eyJa');
    expect(redact('<input name="csrf_token" value="x9">')).toBe(
      '<input name="csrf_token" value="[redacted]">',
    );
    expect(redact('tokenizer')).toBe('tokenizer');
  });

  it('element_label_table', () => {
    const rows: [Capture, string][] = [
      [
        capture('button', ['btn-primary'], 'button', 'New invoice'),
        'button.btn-primary button “New invoice”',
      ],
      [capture('p', ['stat-value'], null, '$6,940.00'), 'p.stat-value “$6,940.00”'],
      [capture('a', ['nav-link'], 'link', 'Invoices'), 'a.nav-link link “Invoices”'],
      [capture('div', [], 'presentation', null), 'div'],
      [capture('span', [], null, 'x'.repeat(70)), `span “${'x'.repeat(59)}…”`],
    ];
    for (const [c, expected] of rows) expect(elementLabel(c)).toBe(expected);
  });
});
