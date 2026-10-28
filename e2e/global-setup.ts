import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRIDGE_EXE, BRIDGE_PORT } from './support/bridge.ts';
import { FAKE_HERDR, FAKE_SSH, REPO_ROOT } from './support/env.ts';

const EXTENSION_DIST = join(REPO_ROOT, 'apps', 'extension', '.output', 'chrome-mv3');

function cargoBuild(manifest: string): void {
  execFileSync('cargo', ['build', '--manifest-path', manifest, '--locked'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
}

function buildExtension(): void {
  execFileSync('bun', ['run', '--filter', '@herdrop/extension', 'build:e2e'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  const manifest = JSON.parse(readFileSync(join(EXTENSION_DIST, 'manifest.json'), 'utf8')) as {
    host_permissions?: string[];
  };
  if (!manifest.host_permissions?.includes('http://localhost/*')) {
    throw new Error(`${EXTENSION_DIST} is not an e2e build: http://localhost/* is missing`);
  }
}

async function bridgePortAnswers(): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  buildExtension();
  cargoBuild('apps/bridge/Cargo.toml');
  cargoBuild('e2e/fake-herdr/Cargo.toml');
  for (const path of [FAKE_HERDR, FAKE_SSH, BRIDGE_EXE]) {
    if (!existsSync(path)) {
      throw new Error(`missing ${path}`);
    }
  }
  if (await bridgePortAnswers()) {
    throw new Error(`port ${BRIDGE_PORT} is busy`);
  }
}
