import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Worker,
} from '@playwright/test';
import type { ExtensionGlobal } from './extension.ts';

export async function openPanel(context: BrowserContext, extensionId: string): Promise<Page> {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByText('Herdrop', { exact: true })).toBeVisible();
  return panel;
}

async function targetTabUrl(sw: () => Promise<Worker>): Promise<string | null> {
  const worker = await sw();
  return worker.evaluate(async () => {
    const { targetTab } = await (
      globalThis as unknown as ExtensionGlobal
    ).chrome.storage.session.get('targetTab');
    return (targetTab as { url?: string } | undefined)?.url ?? null;
  });
}

export async function focusPage(sw: () => Promise<Worker>, page: Page): Promise<void> {
  await page.bringToFront();
  await expect.poll(() => targetTabUrl(sw)).toBe(page.url());
}

export function readClipboard(p: Page): Promise<string> {
  return p.evaluate(() => navigator.clipboard.readText());
}

export async function copyFromPanel(
  sw: () => Promise<Worker>,
  panel: Page,
  page: Page,
  button: Locator,
): Promise<string> {
  await panel.bringToFront();
  await panel.evaluate(() => navigator.clipboard.writeText(''));
  await button.click();
  let text = '';
  await expect
    .poll(async () => {
      text = await readClipboard(panel);
      return text;
    })
    .not.toBe('');
  await focusPage(sw, page);
  return text;
}
