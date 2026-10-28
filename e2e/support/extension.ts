import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, test as base, chromium, type Worker } from '@playwright/test';
import { BRIDGE_PORT, type BridgeHandle, startBridge } from './bridge.ts';
import { REPO_ROOT } from './env.ts';
import { agent, makeAgentDir, type Scenario, writeScenario } from './scenario.ts';

export const EXTENSION_DIST = join(REPO_ROOT, 'apps', 'extension', '.output', 'chrome-mv3');

export type Harness = {
  root: string;
  stateDir: string;
  scenarioDir: string;
  agentCwd: string;
  scenario(): Scenario;
  setScenario(s: Scenario): void;
  bridge: BridgeHandle;
  restartBridge(env?: Record<string, string>): Promise<void>;
};

export type ExtensionGlobal = {
  chrome: {
    storage: {
      local: { set(items: Record<string, unknown>): Promise<void> };
      session: { get(key: string): Promise<Record<string, unknown>> };
    };
    sidePanel: { getPanelBehavior(): Promise<{ openPanelOnActionClick?: boolean }> };
    scripting: {
      getRegisteredContentScripts(): Promise<
        { id: string; matches?: string[]; world?: string; runAt?: string }[]
      >;
    };
  };
};

type Fixtures = {
  harness: Harness;
  context: BrowserContext;
  sw: () => Promise<Worker>;
  extensionId: string;
};

async function liveWorker(context: BrowserContext): Promise<Worker> {
  const [worker] = context.serviceWorkers();
  return worker ?? (await context.waitForEvent('serviceworker'));
}

export const test = base.extend<Fixtures>({
  harness: async ({}, use) => {
    const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'herdrop-e2e-'));
    const stateDir = join(root, 'state');
    const scenarioDir = join(root, 'scenario');
    mkdirSync(stateDir);
    mkdirSync(scenarioDir);
    const agentCwd = makeAgentDir(root, 'one');
    let current: Scenario = {
      machines: [],
      agents: {
        local: [agent({ pane: 'w1:p1', cwd: agentCwd, title: 'Fixture agent', focused: true })],
      },
      prompt: { outcome: 'ok', delay_ms: 0 },
    };
    writeScenario(scenarioDir, current);
    const harness: Harness = {
      root,
      stateDir,
      scenarioDir,
      agentCwd,
      scenario: () => current,
      setScenario: (s) => {
        current = s;
        writeScenario(scenarioDir, s);
      },
      bridge: await startBridge({ stateDir, scenarioDir }),
      restartBridge: async (env) => {
        await harness.bridge.stop();
        harness.bridge = await startBridge({ stateDir, scenarioDir, ...(env ? { env } : {}) });
      },
    };
    try {
      await use(harness);
    } finally {
      await harness.bridge.stop();
      rmSync(root, { recursive: true, force: true, maxRetries: 5 });
    }
  },
  context: async ({ harness: _harness }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  sw: async ({ context }, use) => {
    await use(() => liveWorker(context));
  },
  extensionId: async ({ sw }, use) => {
    const worker = await sw();
    const id = worker.url().split('/')[2] ?? '';
    await worker.evaluate(
      (bridgePort) =>
        (globalThis as unknown as ExtensionGlobal).chrome.storage.local.set({
          settings: { bridgePort },
        }),
      BRIDGE_PORT,
    );
    await use(id);
  },
});

export const expect = test.expect;
