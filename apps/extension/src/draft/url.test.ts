import { expect, it } from 'vitest';
import { normalizeUrl } from './url.ts';

it.each([
  ['http://localhost:4200/orders/7?tab=2#row', 'http://localhost:4200/orders/7'],
  ['https://example.com/app/', 'https://example.com/app/'],
  ['https://example.com/app/?q=1', 'https://example.com/app/'],
  ['not a url', 'not a url'],
])('normalize_url_table: %s', (href, expected) => {
  expect(normalizeUrl(href)).toBe(expected);
});
