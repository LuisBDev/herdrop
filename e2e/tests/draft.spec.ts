import type { Page } from '@playwright/test';
import { expect, test } from '../support/extension.ts';
import { annotate, overlay, pickAgent } from '../support/flow.ts';
import { focusPage, openPanel } from '../support/panel.ts';

const LINKED = /(^|\s)linked(\s|$)/;
const FIXTURE_URL = 'http://localhost:4310/index.html';

async function setup(
  context: Parameters<typeof openPanel>[0],
  sw: Parameters<typeof focusPage>[0],
  extensionId: string,
): Promise<{ page: Page; panel: Page }> {
  const page = await context.newPage();
  await page.goto(FIXTURE_URL);
  await focusPage(sw, page);
  const panel = await openPanel(context, extensionId);
  await pickAgent(panel, 'Fixture agent');
  const targets = [
    ['$48,210.00', 'One'],
    ['$6,940.00', 'Two'],
    ['$112,380.00', 'Three'],
  ] as const;
  for (const [value, comment] of targets) {
    await annotate(sw, page, page.getByText(value, { exact: true }), { intent: 'fix', comment });
  }
  await expect(annotationItem(panel, 'Three')).toBeVisible();
  return { page, panel };
}

function annotationItem(panel: Page, comment: string) {
  return panel
    .getByRole('listitem')
    .filter({ has: panel.getByText(comment, { exact: true }) })
    .filter({ hasNot: panel.getByRole('listitem') });
}

function marker(page: Page, n: number) {
  return overlay(page).getByRole('button', { name: new RegExp(`^Annotation ${n},`) });
}

function numberOf(panel: Page, text: string) {
  return annotationItem(panel, text).locator('span[aria-hidden="true"]').first();
}

async function deleteItem(panel: Page, text: string): Promise<void> {
  await annotationItem(panel, text)
    .getByRole('button', { name: /^Delete/ })
    .click();
}

test('delete_and_undo_restores_number', async ({ context, sw, extensionId }) => {
  const { page, panel } = await setup(context, sw, extensionId);
  await deleteItem(panel, 'Two');
  await expect(annotationItem(panel, 'Two')).toHaveCount(0);
  await expect(annotationItem(panel, 'One')).toBeVisible();
  await expect(numberOf(panel, 'Three')).toHaveText('2');
  await expect(marker(page, 1)).toBeVisible();
  await expect(marker(page, 2)).toBeVisible();
  await expect(marker(page, 3)).toHaveCount(0);
  await expect(
    panel
      .getByRole('status')
      .filter({ hasText: 'Annotation 2 deleted' })
      .filter({ has: panel.getByRole('button', { name: 'Undo' }) }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Undo' }).click();
  await expect(numberOf(panel, 'Two')).toHaveText('2');
  await expect(numberOf(panel, 'Three')).toHaveText('3');
  await expect(marker(page, 3)).toBeVisible();
  await expect(overlay(page).getByRole('button', { name: /^Annotation \d,/ })).toHaveCount(3);
});

test('undo_row_disappears_after_8_s', async ({ context, sw, extensionId }) => {
  const { panel } = await setup(context, sw, extensionId);
  await deleteItem(panel, 'Two');
  await expect(panel.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Undo' })).toBeHidden({ timeout: 9000 });
  await expect(annotationItem(panel, 'Two')).toHaveCount(0);
});

test('marker_hover_highlights_list_item', async ({ context, sw, extensionId }) => {
  const { page, panel } = await setup(context, sw, extensionId);
  await focusPage(sw, page);
  await marker(page, 1).hover();
  await expect(annotationItem(panel, 'One')).toHaveClass(LINKED);
  await page.locator('h1.page-title').hover();
  await expect(annotationItem(panel, 'One')).not.toHaveClass(LINKED);
});

test('list_item_hover_highlights_marker', async ({ context, sw, extensionId }) => {
  const { page, panel } = await setup(context, sw, extensionId);
  await panel.bringToFront();
  await annotationItem(panel, 'Two').hover();
  await expect(marker(page, 2)).toHaveClass(LINKED);
  await expect(overlay(page).locator('.ov-box.link')).toBeVisible();
});

test('note_box_hover_highlights_list_item', async ({ context, sw, extensionId }) => {
  const { page, panel } = await setup(context, sw, extensionId);
  await focusPage(sw, page);
  await marker(page, 1).click();
  const dialog = overlay(page).getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.hover();
  await expect(annotationItem(panel, 'One')).toHaveClass(LINKED);
  await page.keyboard.press('Escape');
});
