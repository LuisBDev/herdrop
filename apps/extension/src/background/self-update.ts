import type { Health } from '@herdrop/protocol';
import { browser } from 'wxt/browser';
import { bridgeBase, createBridgeClient } from '../bridge/client.ts';
import { draftItem, reloadedForVersionItem } from '../storage/items.ts';

export const SELF_UPDATE_ALARM = 'bridge-extension-version';
const CHECK_PERIOD_MINUTES = 15;

export type SelfUpdateDeps = {
  health: () => Promise<Health>;
  installedVersion: () => string;
  draftIsEmpty: () => Promise<boolean>;
  reloadedFor: {
    getValue: () => Promise<string | null>;
    setValue: (version: string) => Promise<void>;
  };
  reload: () => void;
};

export async function reloadForDeployedVersion(deps: SelfUpdateDeps): Promise<void> {
  let health: Health;
  try {
    health = await deps.health();
  } catch {
    return;
  }
  const deployed = health.extension_version;
  if (deployed === null || deployed === deps.installedVersion()) return;
  if ((await deps.reloadedFor.getValue()) === deployed) return;
  if (!(await deps.draftIsEmpty())) return;
  await deps.reloadedFor.setValue(deployed);
  deps.reload();
}

function installedVersion(): string {
  const manifest = browser.runtime.getManifest();
  return manifest.version_name ?? manifest.version;
}

async function ensureAlarm(): Promise<void> {
  if (await browser.alarms.get(SELF_UPDATE_ALARM)) return;
  await browser.alarms.create(SELF_UPDATE_ALARM, { periodInMinutes: CHECK_PERIOD_MINUTES });
}

export function registerSelfUpdate(): void {
  const client = createBridgeClient(fetch.bind(globalThis), bridgeBase);
  const deps: SelfUpdateDeps = {
    health: () => client.health(),
    installedVersion,
    draftIsEmpty: async () => (await draftItem.getValue()).annotations.length === 0,
    reloadedFor: reloadedForVersionItem,
    reload: () => browser.runtime.reload(),
  };
  const check = async () => {
    try {
      await reloadForDeployedVersion(deps);
    } catch (error) {
      console.error(error);
    }
  };
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SELF_UPDATE_ALARM) void check();
  });
  void ensureAlarm().catch((error: unknown) => console.error(error));
  void check();
}
