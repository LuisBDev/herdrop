import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../support/env.ts';
import { type ExtensionGlobal, expect, test } from '../support/extension.ts';
import { annotate, annotationItem, pickAgent } from '../support/flow.ts';
import { focusPage, openPanel } from '../support/panel.ts';

const FIXTURE_URL = 'http://localhost:4310/index.html';

const { id: FIXED_ID } = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages', 'protocol', 'fixtures', 'extension.json'), 'utf8'),
) as { id: string };

test('loads_with_the_fixed_extension_id', ({ extensionId }) => {
  expect(extensionId).toBe(FIXED_ID);
});

test('toolbar_opens_side_panel_behavior_is_set', async ({ sw }) => {
  const worker = await sw();
  const behavior = await worker.evaluate(() =>
    (globalThis as unknown as ExtensionGlobal).chrome.sidePanel.getPanelBehavior(),
  );
  expect(behavior.openPanelOnActionClick).toBe(true);
});

test('content_scripts_are_registered_for_localhost', async ({ sw }) => {
  await expect
    .poll(async () => {
      const worker = await sw();
      const scripts = await worker.evaluate(() =>
        (globalThis as unknown as ExtensionGlobal).chrome.scripting.getRegisteredContentScripts(),
      );
      return scripts
        .map((script) => ({ id: script.id, local: script.matches?.includes('http://localhost/*') }))
        .sort((a, b) => a.id.localeCompare(b.id));
    })
    .toEqual([
      { id: 'herdrop-capture', local: true },
      { id: 'herdrop-inspector', local: true },
    ]);
});

test('panel_lists_the_fake_agent', async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(FIXTURE_URL);
  await focusPage(sw, page);
  const panel = await openPanel(context, extensionId);
  await expect(panel.getByText('This PC')).toBeVisible();
  await expect(panel.getByText('Fixture agent')).toBeVisible();
});

test('annotate_adds_one_item', async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(FIXTURE_URL);
  await focusPage(sw, page);
  const panel = await openPanel(context, extensionId);
  await pickAgent(panel, 'Fixture agent');
  await annotate(sw, page, page.locator('p.stat-value').nth(1), {
    intent: 'fix',
    comment: 'Wrong total',
  });
  await expect(annotationItem(panel, 'Wrong total')).toBeVisible();
  await annotate(sw, page, page.locator('button.btn-primary'), { intent: 'approve' });
  await expect(annotationItem(panel, 'Annotation 2')).toBeVisible();
  await expect(annotationItem(panel, 'Wrong total')).toBeVisible();
  await expect(annotationItem(panel, 'Annotation 3')).toHaveCount(0);
});
