import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';
import { widenContentScriptCss } from './config/web-accessible.ts';

const e2e = process.env.HERDROP_E2E === '1';

const { key } = JSON.parse(
  readFileSync(new URL('../../packages/protocol/fixtures/extension.json', import.meta.url), 'utf8'),
) as { key: string };

function bridgeVersion(): string {
  const cargo = readFileSync(new URL('../bridge/Cargo.toml', import.meta.url), 'utf8');
  const section = cargo.split(/^\[/m).find((part) => part.startsWith('package]'));
  const version = section?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!version) throw new Error('apps/bridge/Cargo.toml has no [package] version');
  return version;
}

const version = bridgeVersion();
const versionWithoutPrerelease = version.split('-')[0] ?? version;

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-solid'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Herdrop',
    description: 'Point at page elements and hand them to a coding agent in Herdr.',
    version: versionWithoutPrerelease,
    version_name: version,
    key,
    permissions: ['storage', 'sidePanel', 'scripting', 'tabs', 'alarms'],
    host_permissions: ['http://127.0.0.1/*', ...(e2e ? ['http://localhost/*'] : [])],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: 'Herdrop' },
    commands: {
      'toggle-select': {
        suggested_key: { default: 'Alt+Shift+H' },
        description: 'Toggle Select',
      },
      'start-grab': {
        suggested_key: { default: 'Alt+Shift+G' },
        description: 'Start Grab',
      },
    },
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      const { web_accessible_resources } = manifest;
      if (web_accessible_resources) widenContentScriptCss({ web_accessible_resources });
    },
  },
});
