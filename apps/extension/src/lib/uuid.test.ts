import { afterEach, expect, it, vi } from 'vitest';
import { newUuid } from './uuid.ts';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

it('new_uuid_works_without_secure_context', () => {
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });

  const ids = new Set(Array.from({ length: 64 }, () => newUuid()));

  expect(ids.size).toBe(64);
  for (const id of ids) expect(id).toMatch(V4);
});
