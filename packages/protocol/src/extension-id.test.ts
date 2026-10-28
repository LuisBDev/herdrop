import { expect, test } from 'vitest';
import extension from '../fixtures/extension.json';
import { extensionIdFromKey } from './extension-id.ts';

test('fixture_id_matches_its_key', async () => {
  expect(await extensionIdFromKey(extension.key)).toBe(extension.id);
  expect(extension.id).toMatch(/^[a-p]{32}$/);
});
