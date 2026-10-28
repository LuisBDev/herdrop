import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect, test } from '../support/extension.ts';
import { promptCalls } from '../support/scenario.ts';

const ATTACK_URL = 'http://localhost:4310/attack.html';
const DROPS_URL = 'http://127.0.0.1:47899/drops';

test('page_simple_post_carries_origin_and_is_rejected_by_origin', async ({ context, harness }) => {
  const page = await context.newPage();
  const simplePost = page.waitForRequest(
    (r) =>
      r.url() === DROPS_URL &&
      r.method() === 'POST' &&
      (r.headers()['content-type'] ?? '').startsWith('text/plain'),
  );
  await page.goto(ATTACK_URL);
  const request = await simplePost;
  await page.waitForSelector('body[data-done="1"]');

  const response = await request.response();
  expect(response?.status()).toBe(403);
  expect(await page.locator('#json').textContent()).toMatch(/^error:/);

  await sleep(3_000);
  expect(promptCalls(harness.scenarioDir)).toEqual([]);
  expect(existsSync(join(harness.agentCwd, '.herdrop'))).toBe(false);
  expect(harness.bridge.log()).toContain(
    'rejected code=forbidden_origin method=POST origin=http://localhost:4310',
  );
});

test('page_cannot_read_bridge_responses', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(ATTACK_URL);
  await page.waitForSelector('body[data-done="1"]');

  expect(await page.locator('#read').textContent()).toMatch(/^error:/);
  const direct = await page.evaluate(() =>
    fetch('http://127.0.0.1:47899/health').then(
      (r) => `status:${r.status}`,
      (e: Error) => `error:${e.name}`,
    ),
  );
  expect(direct).toMatch(/^error:/);
});
