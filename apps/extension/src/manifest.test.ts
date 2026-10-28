import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(HERE, '../.output/chrome-mv3/manifest.json');
const FIXTURE = resolve(HERE, '../../../packages/protocol/fixtures/extension.json');
const GRANTABLE = ['http://*/*', 'https://*/*'];

type WebAccessible = { resources: string[]; matches?: string[]; use_dynamic_url?: boolean };

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

it('built_manifest_matches_the_extension_contract', () => {
  if (!existsSync(MANIFEST)) throw new Error('run wxt build first');
  const manifest = readJson<Record<string, unknown>>(MANIFEST);
  const { key } = readJson<{ key: string }>(FIXTURE);

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.action).not.toHaveProperty('default_popup');
  expect(manifest.side_panel).toMatchObject({ default_path: expect.any(String) });
  expect(manifest.key).toBe(key);
  expect(manifest.permissions).toEqual(
    expect.arrayContaining(['storage', 'sidePanel', 'scripting', 'tabs']),
  );
  expect(new Set(manifest.host_permissions as string[])).toEqual(new Set(['http://127.0.0.1/*']));
  expect(manifest.optional_host_permissions).toEqual(GRANTABLE);
  expect(manifest.commands).toMatchObject({
    'toggle-select': { suggested_key: { default: 'Alt+Shift+H' } },
    'start-grab': { suggested_key: { default: 'Alt+Shift+G' } },
  });
  expect((manifest.content_scripts as unknown[] | undefined) ?? []).toEqual([]);
  const cssEntries = (
    (manifest.web_accessible_resources as WebAccessible[] | undefined) ?? []
  ).filter((entry) =>
    entry.resources.some((resource) => /^content-scripts\/.+\.css$/.test(resource)),
  );
  expect(cssEntries).toEqual([
    { resources: ['content-scripts/capture.css'], matches: GRANTABLE, use_dynamic_url: true },
  ]);
});
