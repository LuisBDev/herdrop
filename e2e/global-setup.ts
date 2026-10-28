import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { BRIDGE_EXE, BRIDGE_PORT } from './support/bridge.ts';
import { FAKE_HERDR, FAKE_SSH, REPO_ROOT } from './support/env.ts';

function cargoBuild(manifest: string): void {
  execFileSync('cargo', ['build', '--manifest-path', manifest, '--locked'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
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
