import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type Browser, browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createSiteSync, registerSiteAccess } from './registration';

type Script = Browser.scripting.RegisteredContentScript;

let granted: string[] = [];
let registered: Map<string, Script>;
let writes: number;

function grant(origins: string[]): void {
  granted = origins;
}

function matchesById(): Record<string, string[] | undefined> {
  return Object.fromEntries([...registered.values()].map((s) => [s.id, s.matches]));
}

beforeEach(() => {
  granted = [];
  registered = new Map();
  writes = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(browser.permissions, 'getAll').mockImplementation(
    async () => ({ origins: ['http://127.0.0.1/*', ...granted], permissions: [] }) as never,
  );
  vi.spyOn(browser.scripting, 'getRegisteredContentScripts').mockImplementation(
    async (filter) =>
      [...registered.values()]
        .filter((s) => !filter?.ids || filter.ids.includes(s.id))
        .map((s) => ({ ...s })) as never,
  );
  vi.spyOn(browser.scripting, 'registerContentScripts').mockImplementation(async (scripts) => {
    writes++;
    if (scripts.some((s) => registered.has(s.id))) throw new Error('Duplicate script ID');
    for (const s of scripts) registered.set(s.id, { ...s });
  });
  vi.spyOn(browser.scripting, 'updateContentScripts').mockImplementation(async (scripts) => {
    writes++;
    for (const s of scripts) {
      const current = registered.get(s.id);
      if (!current) throw new Error('Nonexistent script ID');
      registered.set(s.id, { ...current, ...s } as Script);
    }
  });
  vi.spyOn(browser.scripting, 'unregisterContentScripts').mockImplementation(async (filter) => {
    writes++;
    for (const id of filter?.ids ?? [...registered.keys()]) registered.delete(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

it('sync_reconciles_table', async () => {
  const site = createSiteSync();
  const rows: { origins: string[]; matches: string[] | null; wrote: boolean }[] = [
    { origins: ['http://localhost:4200/*'], matches: ['http://localhost:4200/*'], wrote: true },
    {
      origins: ['https://b.example.com/*', 'http://localhost:4200/*'],
      matches: ['http://localhost:4200/*', 'https://b.example.com/*'],
      wrote: true,
    },
    {
      origins: ['http://localhost:4200/*', 'https://b.example.com/*'],
      matches: ['http://localhost:4200/*', 'https://b.example.com/*'],
      wrote: false,
    },
    { origins: [], matches: null, wrote: true },
  ];

  for (const row of rows) {
    grant(row.origins);
    const before = writes;
    await site.sync();
    expect(writes > before).toBe(row.wrote);
    if (row.matches === null) {
      expect(registered.size).toBe(0);
    } else {
      expect(matchesById()).toEqual({
        'herdrop-inspector': row.matches,
        'herdrop-capture': row.matches,
      });
    }
  }
  expect(console.error).not.toHaveBeenCalled();
});

it('concurrent_syncs_register_once', async () => {
  grant(['http://localhost:4200/*']);
  const site = createSiteSync();

  await Promise.all([site.sync(), site.sync()]);

  expect(browser.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
  expect(console.error).not.toHaveBeenCalled();
  expect(Object.keys(matchesById()).sort()).toEqual(['herdrop-capture', 'herdrop-inspector']);
});

it('on_installed_triggers_a_sync', async () => {
  vi.spyOn(browser.permissions.onAdded, 'addListener').mockImplementation(() => undefined);
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(() => undefined);

  registerSiteAccess();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(registered.size).toBe(0);
  grant(['http://localhost:4200/*']);
  await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as never);

  expect(matchesById()).toEqual({
    'herdrop-inspector': ['http://localhost:4200/*'],
    'herdrop-capture': ['http://localhost:4200/*'],
  });
});

it('sync_and_inject_injects_main_then_isolated', async () => {
  const injected: unknown[] = [];
  vi.spyOn(browser.scripting, 'executeScript').mockImplementation((async (injection: {
    files: string[];
    world: string;
  }) => {
    injected.push([injection.files, injection.world]);
    if (injected.length === 1) throw new Error('Cannot access contents of the page');
    return [];
  }) as never);
  const site = createSiteSync();

  await expect(site.syncAndInject(9)).resolves.toBeUndefined();

  expect(injected).toEqual([
    [['content-scripts/inspector.js'], 'MAIN'],
    [['content-scripts/capture.js'], 'ISOLATED'],
  ]);
  expect(console.error).toHaveBeenCalled();
});
