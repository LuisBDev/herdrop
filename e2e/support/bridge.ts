import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { EXE, REPO_ROOT, scrubbedEnv } from './env.ts';

export const BRIDGE_PORT = 47899;
export const BRIDGE_EXE = join(REPO_ROOT, 'apps', 'bridge', 'target', 'debug', `herdrop${EXE}`);

const HEALTH_URL = `http://127.0.0.1:${BRIDGE_PORT}/health`;

export type BridgeHandle = {
  output(): string;
  log(): string;
  stop(): Promise<void>;
};

export type StartBridgeOptions = {
  stateDir: string;
  scenarioDir: string;
  env?: Record<string, string>;
};

function portAccepts(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: BRIDGE_PORT });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForFreePort(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (await portAccepts()) {
    if (Date.now() >= deadline) {
      throw new Error(`port ${BRIDGE_PORT} is busy`);
    }
    await sleep(100);
  }
}

async function healthAnswers(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function exited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (exited(child)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

export async function startBridge({
  stateDir,
  scenarioDir,
  env = {},
}: StartBridgeOptions): Promise<BridgeHandle> {
  await waitForFreePort(5_000);
  const logFile = join(stateDir, 'herdrop.log');
  const child = spawn(BRIDGE_EXE, ['serve', '--port', String(BRIDGE_PORT), '--log-file', logFile], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: scrubbedEnv({
      FAKE_HERDR_SCENARIO: join(scenarioDir, 'scenario.json'),
      FAKE_HERDR_LOG: join(scenarioDir, 'log.jsonl'),
      HERDR_PLUGIN_STATE_DIR: stateDir,
      HERDR_PLUGIN_CONFIG_DIR: join(stateDir, 'config'),
      ...env,
    }),
  });
  let collected = '';
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    collected += chunk;
  });
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    collected += chunk;
  });
  let spawnError = '';
  child.once('error', (error) => {
    spawnError = String(error);
  });

  const handle: BridgeHandle = {
    output: () => collected,
    log: () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''),
    stop: async () => {
      if (!exited(child)) {
        const exit = waitForExit(child);
        child.kill();
        await exit;
      }
      while (await portAccepts()) {
        await sleep(100);
      }
    },
  };

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (spawnError !== '' || exited(child)) {
      throw new Error(`bridge exited before /health answered: ${spawnError}\n${collected}`);
    }
    if (await healthAnswers()) {
      return handle;
    }
    await sleep(100);
  }
  await handle.stop();
  throw new Error(`bridge /health did not answer within 10 s\n${collected}`);
}
