import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApiError, MachinesResponse } from '@herdrop/protocol';
import { expect, test } from '@playwright/test';
import { BRIDGE_PORT, startBridge } from '../support/bridge.ts';
import { FAKE_BIN_DIR, FAKE_HERDR, scrubbedEnv } from '../support/env.ts';
import { agent, makeAgentDir, readLog, writeScenario } from '../support/scenario.ts';

const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
const HERDR_KEYS = [
  'HERDR_ENV',
  'HERDR_SOCKET_PATH',
  'HERDR_PANE_ID',
  'HERDR_WORKSPACE_ID',
  'HERDR_TAB_ID',
];

function tempRoot(): string {
  return realpathSync.native(tmpdir());
}

function localScenarioDirs(): { stateDir: string; scenarioDir: string } {
  const root = tempRoot();
  const scenarioDir = mkdtempSync(join(root, 'herdrop-e2e-scenario-'));
  const stateDir = mkdtempSync(join(root, 'herdrop-e2e-state-'));
  writeScenario(scenarioDir, {
    machines: [],
    agents: {
      local: [agent({ pane: 'w1:p1', cwd: makeAgentDir(root, 'harness'), title: 'harness' })],
    },
    prompt: { outcome: 'ok', delay_ms: 0 },
  });
  return { stateDir, scenarioDir };
}

test('scrubbed_env_points_at_the_fakes', () => {
  const saved = { ...process.env };
  try {
    process.env.Path = 'C:\\real';
    process.env.PATH = '/usr/bin';
    process.env.HERDR_ENV = '1';
    process.env.HERDR_SOCKET_PATH = 'x';
    const env = scrubbedEnv();
    const pathKeys = Object.keys(env).filter((key) => key.toUpperCase() === 'PATH');
    expect(pathKeys).toHaveLength(1);
    expect(env[pathKeys[0] ?? '']).toBe(FAKE_BIN_DIR);
    expect(env.HERDR_BIN_PATH).toBe(FAKE_HERDR);
    const herdrKeys = Object.keys(env).filter((key) => HERDR_KEYS.includes(key.toUpperCase()));
    expect(herdrKeys).toEqual([]);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, saved);
  }
});

test('bridge_lists_machines_through_the_fake', async () => {
  const { stateDir, scenarioDir } = localScenarioDirs();
  const bridge = await startBridge({ stateDir, scenarioDir });
  try {
    const response = await fetch(`${BRIDGE_URL}/machines`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as MachinesResponse;
    expect(body.machines[0]).toEqual({ key: 'local', label: 'local', local: true });
    expect(readLog(scenarioDir)).toContainEqual({
      bin: 'herdr',
      argv: ['machine', 'list', '--json'],
    });
  } finally {
    await bridge.stop();
  }
});

test('bridge_refuses_a_page_origin', async () => {
  const { stateDir, scenarioDir } = localScenarioDirs();
  const bridge = await startBridge({ stateDir, scenarioDir });
  try {
    const response = await fetch(`${BRIDGE_URL}/health`, {
      headers: { Origin: 'http://localhost:4310' },
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as ApiError;
    expect(body.error.code).toBe('forbidden_origin');
  } finally {
    await bridge.stop();
  }
});
