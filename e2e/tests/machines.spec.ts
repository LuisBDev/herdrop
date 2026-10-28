import { join } from 'node:path';
import { EXE } from '../support/env.ts';
import { expect, test } from '../support/extension.ts';
import { annotate, pickAgent } from '../support/flow.ts';
import { focusPage, openPanel } from '../support/panel.ts';
import { agent, machine, promptCalls, readLog } from '../support/scenario.ts';

const FIXTURE_URL = 'http://localhost:4310/index.html';
const REMOTE_ID = '779f8353534145c8951edca5f0dd34cd';
const REMOTE_LIST = ['--machine', REMOTE_ID, 'agent', 'list'];

test('herdr_missing_shows_local_notice', async ({ context, sw, extensionId, harness }) => {
  await harness.restartBridge({ HERDR_BIN_PATH: join(harness.root, 'missing', `herdr${EXE}`) });
  const page = await context.newPage();
  await page.goto(FIXTURE_URL);
  await focusPage(sw, page);
  const panel = await openPanel(context, extensionId);
  await expect(panel.getByText('This PC')).toBeVisible();
  await expect(panel.getByText('Herdr not found')).toBeVisible();
  await expect(panel.getByText("Can't reach the Herdrop bridge")).toBeHidden();
});

test('remote_agents_use_the_profile_id_and_ssh_failure_fails_the_drop', async ({
  context,
  sw,
  extensionId,
  harness,
}) => {
  const local = harness.scenario().agents.local ?? [];
  const remoteAgent = agent({ pane: 'w2:p1', cwd: "/home/dev/it's here", title: 'Remote agent' });
  const base = {
    ...harness.scenario(),
    machines: [machine({ id: REMOTE_ID, label: 'My VPS', target: 'vps' })],
  };
  harness.setScenario({ ...base, agents: { local, [REMOTE_ID]: [remoteAgent] } });
  await harness.restartBridge();

  const page = await context.newPage();
  await page.goto(FIXTURE_URL);
  await focusPage(sw, page);
  const panel = await openPanel(context, extensionId);
  await expect(panel.getByText('My VPS')).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText('Remote agent')).toBeVisible({ timeout: 20_000 });

  const listCalls = () =>
    readLog(harness.scenarioDir).filter(
      (entry) =>
        entry.bin === 'herdr' && JSON.stringify(entry.argv) === JSON.stringify(REMOTE_LIST),
    );
  expect(listCalls().length).toBeGreaterThanOrEqual(1);
  expect(readLog(harness.scenarioDir).some((entry) => entry.argv.includes('My VPS'))).toBe(false);

  const before = listCalls().length;
  const second = agent({ pane: 'w2:p2', cwd: '/home/dev/two', title: 'Remote two' });
  harness.setScenario({ ...base, agents: { local, [REMOTE_ID]: [remoteAgent, second] } });
  await panel.getByRole('button', { name: 'Refresh agents on My VPS' }).click();
  await expect(panel.getByText('Remote two')).toBeVisible({ timeout: 5_000 });
  expect(listCalls()).toHaveLength(before + 1);

  await pickAgent(panel, 'Remote agent');
  await annotate(sw, page, page.locator('p.stat-value').nth(1), {
    intent: 'fix',
    comment: 'Wrong total',
  });
  await panel.getByRole('button', { name: /^Send/ }).click();
  await expect(panel.getByText('Drop failed', { exact: true })).toBeVisible({ timeout: 30_000 });

  const sshCalls = readLog(harness.scenarioDir).filter((entry) => entry.bin === 'ssh');
  expect(sshCalls).toHaveLength(1);
  const argv = sshCalls[0]?.argv ?? [];
  expect(argv).toHaveLength(5);
  expect(argv.slice(0, 4)).toEqual(['-T', '-o', 'BatchMode=yes', 'vps']);
  expect(argv[4]).toMatch(/^sh -c '/);
  expect(promptCalls(harness.scenarioDir)).toEqual([]);
});
