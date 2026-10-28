import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test } from '../support/extension.ts';
import { annotate, annotationItem, overlay, pickAgent } from '../support/flow.ts';
import { focusPage, openPanel } from '../support/panel.ts';
import { DROP_ID } from '../support/scenario.ts';

const PLAIN_URL = 'http://localhost:4310/index.html';
const REACT_URL = 'http://localhost:4311/';
const ANGULAR_DEV_URL = 'http://localhost:4312/';
const ANGULAR_PROD_URL = 'http://localhost:4313/';

type Session = { page: Page; panel: Page };

async function start(
  context: BrowserContext,
  sw: () => Promise<Worker>,
  extensionId: string,
  url: string,
): Promise<Session> {
  const page = await context.newPage();
  await page.goto(url);
  await focusPage(sw, page);
  const panel = await openPanel(context, extensionId);
  await pickAgent(panel, 'Fixture agent');
  await focusPage(sw, page);
  return { page, panel };
}

function totalCard(page: Page) {
  return page.locator('p.stat-value').nth(1);
}

function hoverBox(page: Page) {
  return overlay(page).locator('.ov-box:not(.link, .fixed)');
}

test('plain_page_captures_without_component', async ({ context, sw, extensionId }) => {
  const { page, panel } = await start(context, sw, extensionId, PLAIN_URL);
  await annotate(sw, page, totalCard(page), { intent: 'fix', comment: 'Wrong total' });
  const item = annotationItem(panel, 'Wrong total');
  await expect(item).toContainText('No component detected');
  await expect(item).toContainText('p.stat-value “$6,940.00”');
});

test('react_page_reports_component_chain', async ({ context, sw, extensionId, harness }) => {
  const { page, panel } = await start(context, sw, extensionId, REACT_URL);
  await annotate(sw, page, totalCard(page), { intent: 'fix', comment: 'Wrong total' });
  await expect(annotationItem(panel, 'Wrong total')).toContainText('StatCard');
  await panel.bringToFront();
  await panel.getByRole('button', { name: /^Send( \d+)?$/ }).click();
  await expect(panel.getByText('Delivered to Fixture agent')).toBeVisible();
  const dropDir = join(harness.agentCwd, '.herdrop', 'drop');
  const bundles = readdirSync(dropDir).filter((name) => DROP_ID.test(name));
  expect(bundles).toHaveLength(1);
  const note = readFileSync(join(dropDir, bundles[0] ?? '', 'A1.md'), 'utf8');
  expect(note).toContain('`App > InvoiceList > StatCard`');
});

test('angular_dev_reports_component_names', async ({ context, sw, extensionId }) => {
  const { page, panel } = await start(context, sw, extensionId, ANGULAR_DEV_URL);
  await annotate(sw, page, totalCard(page), { intent: 'fix', comment: 'Wrong total' });
  await expect(annotationItem(panel, 'Wrong total')).toContainText('StatCardComponent');
});

test('angular_prod_has_no_ng_global', async ({ context, sw, extensionId }) => {
  const { page, panel } = await start(context, sw, extensionId, ANGULAR_PROD_URL);
  await annotate(sw, page, totalCard(page), { intent: 'fix', comment: 'Wrong total' });
  await expect(annotationItem(panel, 'Wrong total')).toContainText('No component detected');
  expect(await page.evaluate(() => 'ng' in window)).toBe(false);
});

test('arrow_up_selects_parent', async ({ context, sw, extensionId }) => {
  const { page } = await start(context, sw, extensionId, PLAIN_URL);
  const label = overlay(page).locator('.ov-label');
  await totalCard(page).hover();
  await expect(label).toContainText('p.stat-value');
  await page.keyboard.press('ArrowUp');
  await expect(label).toContainText('div.stat-card');
  await page.keyboard.press('ArrowDown');
  await expect(label).toContainText('p.stat-value');
});

test('selection_survives_reload', async ({ context, sw, extensionId }) => {
  const { page } = await start(context, sw, extensionId, PLAIN_URL);
  await annotate(sw, page, totalCard(page), { intent: 'fix', comment: 'Wrong total' });
  await page.reload();
  await focusPage(sw, page);
  await expect(overlay(page).getByRole('button', { name: /^Annotation 1,/ })).toBeVisible();
  await page.getByText('$48,210.00', { exact: true }).hover();
  await expect(hoverBox(page)).toBeVisible();
});

test('overlay_styles_load_on_granted_site', async ({ context, sw, extensionId }) => {
  const { page } = await start(context, sw, extensionId, PLAIN_URL);
  expect(await overlay(page).evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  await totalCard(page).hover();
  await expect(hoverBox(page)).toBeVisible();
  await totalCard(page).click();
  const dialog = overlay(page).getByRole('dialog');
  await expect(dialog).toBeVisible();
  const style = await dialog.evaluate((el) => {
    const computed = getComputedStyle(el);
    return { position: computed.position, background: computed.backgroundColor };
  });
  expect(style.position).toBe('fixed');
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
