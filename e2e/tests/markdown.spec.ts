import { expect, test } from '@playwright/test';
import { outsideCode } from '../support/markdown.ts';

test('outside_code_keeps_only_text_outside_spans_and_fences', () => {
  const rows: [string, string][] = [
    ['````\na ``` b\n````', ''],
    ['x ``a`b`` y', 'x  y'],
    ['plain text', 'plain text'],
    ['a ` b', 'a ` b'],
  ];
  for (const [input, expected] of rows) {
    expect(outsideCode(input), JSON.stringify(input)).toBe(expected);
  }
});
