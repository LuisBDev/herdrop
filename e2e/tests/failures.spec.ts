import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import { expect, type Harness, test } from '../support/extension.ts';
import { annotate, annotationItem, pickAgent } from '../support/flow.ts';
import { focusPage, openPanel } from '../support/panel.ts';
import { agent, makeAgentDir, promptCalls } from '../support/scenario.ts';

const FIXTURE_URL = 'http://localhost:4310/index.html';

type SetupFixtures = {
  context: BrowserContext;
  sw: () => Promise<Worker>;
  extensionId: string;
};

async function setup({ context, sw, extensionId }: SetupFixtures): Promise<Page> {
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
  return panel;
}

function sendButton(panel: Page): Locator {
  return panel.getByRole('button', { name: /^Send \d+$/ });
}

function failure(panel: Page, title: string): Locator {
  return panel.getByRole('alert').filter({ hasText: title });
}

function delivered(panel: Page, name: string): Locator {
  return panel.getByText(`Delivered to ${name}`, { exact: true });
}

function dropFolders(folder: string): string[] {
  const drop = join(folder, '.herdrop', 'drop');
  if (!existsSync(drop)) {
    return [];
  }
  return readdirSync(drop, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function promptLines(harness: Harness): string[] {
  return promptCalls(harness.scenarioDir).map((argv) => argv[argv.indexOf('prompt') + 2] ?? '');
}

test('blocked_agent_fails_before_writing', async ({ harness, context, sw, extensionId }) => {
  const panel = await setup({ context, sw, extensionId });
  harness.setScenario({
    ...harness.scenario(),
    agents: {
      local: [
        agent({
          pane: 'w1:p1',
          cwd: harness.agentCwd,
          title: 'Fixture agent',
          focused: true,
          status: 'blocked',
        }),
      ],
    },
  });
  await sendButton(panel).click();
  const alert = failure(panel, 'Agent is blocked');
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  expect(existsSync(join(harness.agentCwd, '.herdrop'))).toBe(false);
  expect(promptCalls(harness.scenarioDir)).toEqual([]);
});

test('gone_agent_offers_move', async ({ harness, context, sw, extensionId }) => {
  const second = makeAgentDir(harness.root, 'two');
  const secondAgent = agent({ pane: 'w1:p2', cwd: second, title: 'Second agent' });
  harness.setScenario({
    ...harness.scenario(),
    agents: {
      local: [
        agent({ pane: 'w1:p1', cwd: harness.agentCwd, title: 'Fixture agent', focused: true }),
        secondAgent,
      ],
    },
  });
  await harness.restartBridge();
  const panel = await setup({ context, sw, extensionId });
  harness.setScenario({ ...harness.scenario(), agents: { local: [secondAgent] } });
  await sendButton(panel).click();
  const alert = failure(panel, 'Agent is gone');
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Move to another agent', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Use this agent' })).toBeVisible();
  await pickAgent(panel, 'Second agent');
  await expect(annotationItem(panel, 'Wrong total')).toBeVisible();
  await sendButton(panel).click();
  await expect(delivered(panel, 'Second agent')).toBeVisible();
  const [bundle] = dropFolders(second);
  expect(bundle).toBeDefined();
  expect(existsSync(join(second, '.herdrop', 'drop', bundle ?? '', 'README.md'))).toBe(true);
  expect(existsSync(join(harness.agentCwd, '.herdrop'))).toBe(false);
});

test('no_activity_then_resend_reuses_bundle', async ({ harness, context, sw, extensionId }) => {
  const panel = await setup({ context, sw, extensionId });
  harness.setScenario({
    ...harness.scenario(),
    prompt: { outcome: 'agent_prompt_stalled', delay_ms: 0 },
  });
  await sendButton(panel).click();
  const alert = failure(panel, 'No activity yet');
  await expect(alert).toBeVisible();
  harness.setScenario({ ...harness.scenario(), prompt: { outcome: 'ok', delay_ms: 0 } });
  await alert.getByRole('button', { name: 'Resend prompt', exact: true }).click();
  await expect(delivered(panel, 'Fixture agent')).toBeVisible();
  expect(dropFolders(harness.agentCwd)).toHaveLength(1);
  const lines = promptLines(harness);
  expect(lines).toHaveLength(2);
  expect(lines[1]).toBe(lines[0]);
});

test('bridge_down_shows_bridge_unreachable', async ({ harness, context, sw, extensionId }) => {
  const panel = await setup({ context, sw, extensionId });
  await harness.bridge.stop();
  await sendButton(panel).click();
  const alert = failure(panel, 'Bridge not running');
  await expect(alert).toBeVisible({ timeout: 10_000 });
  for (const name of ['Retry', 'Copy all', 'Move to another agent', 'Discard']) {
    await expect(alert.getByRole('button', { name, exact: true })).toBeVisible();
  }
});

test('bridge_restart_mid_send_then_retry_delivers', async ({
  harness,
  context,
  sw,
  extensionId,
}) => {
  test.setTimeout(90_000);
  const panel = await setup({ context, sw, extensionId });
  harness.setScenario({ ...harness.scenario(), prompt: { outcome: 'ok', delay_ms: 4000 } });
  await sendButton(panel).click();
  await expect.poll(() => promptCalls(harness.scenarioDir).length).toBe(1);
  harness.setScenario({ ...harness.scenario(), prompt: { outcome: 'ok', delay_ms: 0 } });
  await harness.restartBridge();
  const retry = panel.getByRole('alert').getByRole('button', { name: 'Retry', exact: true });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await retry.click();
  await expect(delivered(panel, 'Fixture agent')).toBeVisible();
  const folders = dropFolders(harness.agentCwd);
  expect(folders).toHaveLength(2);
  const lines = promptLines(harness);
  const named = lines.map((line) => folders.filter((folder) => line.includes(folder)));
  expect(named).toHaveLength(2);
  expect(named.every((match) => match.length === 1)).toBe(true);
  expect(new Set(named.flat()).size).toBe(2);
});
