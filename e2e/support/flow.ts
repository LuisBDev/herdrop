import { expect, type Locator, type Page, type Worker } from '@playwright/test';
import { focusPage } from './panel.ts';

export type AnnotationInput = {
  intent: 'fix' | 'change' | 'question' | 'approve';
  comment?: string;
  priority?: 'blocking' | 'important' | 'suggestion';
};

export function overlay(page: Page): Locator {
  return page.locator('herdrop-overlay');
}

export async function pickAgent(panel: Page, name: string): Promise<void> {
  await panel.getByRole('radio', { name: new RegExp(name) }).click();
  await panel.getByRole('button', { name: 'Use this agent' }).click();
  await expect(panel.getByRole('button', { name: 'Change' })).toBeVisible();
}

export async function annotate(
  sw: () => Promise<Worker>,
  page: Page,
  target: Locator,
  { intent, comment, priority }: AnnotationInput,
): Promise<void> {
  await focusPage(sw, page);
  await target.hover();
  await expect(overlay(page).locator('.ov-box:not(.link, .fixed)')).toBeVisible();
  await target.click();
  const dialog = overlay(page).getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: new RegExp(`^${intent}$`, 'i') }).check();
  if (priority !== undefined) {
    await dialog.getByRole('button', { name: 'Priority' }).click();
    await dialog.getByRole('radio', { name: new RegExp(`^${priority}$`, 'i') }).check();
  }
  if (comment !== undefined) {
    await dialog.getByRole('textbox', { name: 'Comment' }).fill(comment);
  }
  await page.keyboard.press('Control+Enter');
  await expect(dialog).toBeHidden();
}

export function annotationItem(panel: Page, text: string): Locator {
  return panel
    .getByRole('listitem')
    .filter({ hasText: text })
    .filter({ hasNot: panel.getByRole('listitem') });
}
