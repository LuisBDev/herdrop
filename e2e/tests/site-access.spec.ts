import type { Page, Worker } from '@playwright/test';
import { type ExtensionGlobal, expect, test } from '../support/extension.ts';
import { annotate, annotationItem, overlay, pickAgent } from '../support/flow.ts';
import { focusPage, openPanel } from '../support/panel.ts';

const PAGE_URL = 'http://localhost:4311/';
const SCRIPT_IDS = ['herdrop-capture', 'herdrop-inspector'];

type SiteAccessChrome = {
  chrome: {
    scripting: { unregisterContentScripts(filter: { ids: string[] }): Promise<void> };
    tabs: { query(info: { url: string }): Promise<{ id?: number }[]> };
  };
};

async function unregisterScripts(sw: () => Promise<Worker>): Promise<void> {
  const worker = await sw();
  await worker.evaluate(
    (ids) =>
      (globalThis as unknown as SiteAccessChrome).chrome.scripting.unregisterContentScripts({
        ids,
      }),
    SCRIPT_IDS,
  );
}

async function registeredIds(sw: () => Promise<Worker>): Promise<string[]> {
  const worker = await sw();
  const scripts = await worker.evaluate(() =>
    (globalThis as unknown as ExtensionGlobal).chrome.scripting.getRegisteredContentScripts(),
  );
  return scripts.map((script) => script.id);
}

async function pageTabId(sw: () => Promise<Worker>): Promise<number> {
  const worker = await sw();
  const tabs = await worker.evaluate(
    (url) => (globalThis as unknown as SiteAccessChrome).chrome.tabs.query({ url }),
    `${PAGE_URL}*`,
  );
  const id = tabs[0]?.id;
  if (id === undefined) throw new Error('fixture tab not found');
  return id;
}

async function syncSiteAccess(
  panel: Page,
  tabId: number,
): Promise<{ res?: unknown; err?: unknown }> {
  return panel.evaluate(
    (id) =>
      (
        globalThis as unknown as {
          chrome: {
            runtime: { sendMessage(message: unknown): Promise<{ res?: unknown; err?: unknown }> };
          };
        }
      ).chrome.runtime.sendMessage({
        id: Date.now(),
        type: 'syncSiteAccess',
        data: { tabId: id },
        timestamp: Date.now(),
      }),
    tabId,
  );
}

test('open_tab_gets_overlay_without_reload', async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await focusPage(sw, page);
  const panel = await openPanel(context, extensionId);
  await pickAgent(panel, 'Fixture agent');
  await unregisterScripts(sw);
  await page.reload();
  await expect(overlay(page)).toHaveCount(0);
  const tabId = await pageTabId(sw);
  const reply = await syncSiteAccess(panel, tabId);
  expect(reply.err).toBeUndefined();
  await expect(overlay(page)).toHaveCount(1);
  expect(await registeredIds(sw)).toEqual(expect.arrayContaining(SCRIPT_IDS));
  await annotate(sw, page, page.locator('p.stat-value').nth(1), {
    intent: 'fix',
    comment: 'Late inject',
  });
  await expect(annotationItem(panel, 'Late inject')).toContainText('StatCard');
});

test('second_injection_is_a_no_op', async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await focusPage(sw, page);
  const panel = await openPanel(context, extensionId);
  await pickAgent(panel, 'Fixture agent');
  await unregisterScripts(sw);
  await page.reload();
  await expect(overlay(page)).toHaveCount(0);
  const tabId = await pageTabId(sw);
  expect((await syncSiteAccess(panel, tabId)).err).toBeUndefined();
  await expect(overlay(page)).toHaveCount(1);
  expect((await syncSiteAccess(panel, tabId)).err).toBeUndefined();
  await expect(overlay(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.dataset.herdrop)).toBeDefined();
  await page.reload();
  await expect(overlay(page)).toHaveCount(1);
});
