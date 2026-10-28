import { type Browser, browser } from 'wxt/browser';
import { targetTabItem } from '../storage/items.ts';

export function isWebUrl(url: string | undefined): url is string {
  if (url === undefined) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function record(tab: { id?: number | undefined; url?: string | undefined } | undefined) {
  if (tab?.id === undefined || !isWebUrl(tab.url)) return;
  await targetTabItem.setValue({ id: tab.id, url: tab.url });
}

export async function onTabActivated({ tabId }: { tabId: number }): Promise<void> {
  await record(await browser.tabs.get(tabId));
}

export async function onTabUpdated(
  tabId: number,
  changeInfo: Browser.tabs.OnUpdatedInfo,
  tab: Browser.tabs.Tab,
): Promise<void> {
  if (!tab.active || changeInfo.url === undefined) return;
  await record({ id: tabId, url: changeInfo.url });
}

export async function onWindowFocusChanged(windowId: number): Promise<void> {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  const [tab] = await browser.tabs.query({ active: true, windowId });
  await record(tab);
}
