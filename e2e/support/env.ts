import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
export const EXE = process.platform === 'win32' ? '.exe' : '';
export const FAKE_BIN_DIR = join(REPO_ROOT, 'e2e', 'fake-herdr', 'target', 'debug');
export const FAKE_HERDR = join(FAKE_BIN_DIR, `herdr${EXE}`);
export const FAKE_SSH = join(FAKE_BIN_DIR, `ssh${EXE}`);

const SCRUBBED_KEYS = new Set([
  'PATH',
  'HERDR_ENV',
  'HERDR_BIN_PATH',
  'HERDR_SOCKET_PATH',
  'HERDR_PANE_ID',
  'HERDR_WORKSPACE_ID',
  'HERDR_TAB_ID',
]);

export function scrubbedEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !SCRUBBED_KEYS.has(key.toUpperCase())) {
      env[key] = value;
    }
  }
  env.PATH = FAKE_BIN_DIR;
  env.HERDR_BIN_PATH = FAKE_HERDR;
  return { ...env, ...extra };
}
