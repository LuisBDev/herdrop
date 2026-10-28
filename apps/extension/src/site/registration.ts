import { type Browser, browser, type PublicPath } from 'wxt/browser';
import { createSerial } from '../lib/serial.ts';
import { backgroundMessenger } from '../messaging/background.ts';
import { grantedSiteOrigins } from './access.ts';

type ScriptPath = Extract<PublicPath, `${string}.js`>;
type ContentScript = Browser.scripting.RegisteredContentScript & {
  js: string[];
  world: 'MAIN' | 'ISOLATED';
};

export const SCRIPTS: readonly Omit<ContentScript, 'matches'>[] = [
  {
    id: 'herdrop-inspector',
    js: ['content-scripts/inspector.js'],
    world: 'MAIN',
    runAt: 'document_start',
    persistAcrossSessions: true,
  },
  {
    id: 'herdrop-capture',
    js: ['content-scripts/capture.js'],
    world: 'ISOLATED',
    runAt: 'document_idle',
    persistAcrossSessions: true,
  },
];

const IDS = SCRIPTS.map((script) => script.id);

function sameMatches(a: string[] | undefined, b: string[]): boolean {
  const sorted = [...(a ?? [])].sort();
  return sorted.length === b.length && sorted.every((match, i) => match === b[i]);
}

async function reconcile(): Promise<void> {
  const origins = [...(await grantedSiteOrigins())].sort();
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: IDS });
  if (origins.length === 0) {
    if (registered.length > 0) {
      await browser.scripting.unregisterContentScripts({ ids: registered.map((s) => s.id) });
    }
    return;
  }
  const byId = new Map(registered.map((script) => [script.id, script]));
  const missing = SCRIPTS.filter((script) => !byId.has(script.id));
  const stale = SCRIPTS.filter((script) => {
    const current = byId.get(script.id);
    return current !== undefined && !sameMatches(current.matches, origins);
  });
  if (missing.length > 0) {
    await browser.scripting.registerContentScripts(
      missing.map((script) => ({ ...script, matches: origins })),
    );
  }
  if (stale.length > 0) {
    await browser.scripting.updateContentScripts(
      stale.map((script) => ({ ...script, matches: origins })),
    );
  }
}

async function sync(): Promise<void> {
  try {
    await reconcile();
  } catch (error) {
    console.error(error);
  }
}

export async function injectIntoTab(tabId: number): Promise<void> {
  for (const script of SCRIPTS) {
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: script.js as ScriptPath[],
        world: script.world,
      });
    } catch (error) {
      console.error(error);
    }
  }
}

export function createSiteSync(): {
  sync(): Promise<void>;
  syncAndInject(tabId: number | null): Promise<void>;
} {
  const serial = createSerial();
  return {
    sync: () => serial(sync),
    syncAndInject: (tabId) =>
      serial(async () => {
        await sync();
        if (tabId !== null) await injectIntoTab(tabId);
      }),
  };
}

export function registerSiteAccess(): void {
  const site = createSiteSync();
  browser.runtime.onInstalled.addListener(() => site.sync());
  browser.permissions.onAdded.addListener(() => site.sync());
  browser.permissions.onRemoved.addListener(() => site.sync());
  backgroundMessenger.onMessage('syncSiteAccess', ({ data }) => site.syncAndInject(data.tabId));
  void site.sync();
}
