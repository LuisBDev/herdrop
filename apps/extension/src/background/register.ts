import { browser } from 'wxt/browser';
import { createDraftStore } from '../draft/store.ts';
import { backgroundMessenger } from '../messaging/background.ts';
import { tabMessenger } from '../messaging/tab.ts';
import { createBroadcast } from './broadcast.ts';
import { createHandlers } from './handlers.ts';
import { onTabActivated, onTabUpdated, onWindowFocusChanged } from './target-tab.ts';

async function openPanelOnActionClick(): Promise<void> {
  try {
    await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error(error);
  }
}

function ignoringRejection<A extends unknown[]>(
  listener: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  return async (...args) => {
    try {
      await listener(...args);
    } catch {
      return;
    }
  };
}

export function registerWorker(): void {
  const store = createDraftStore({
    onCommitted: createBroadcast((tabId, state) =>
      tabMessenger.sendMessage('pageStateChanged', state, tabId),
    ),
  });
  const handlers = createHandlers(store, (tabId, type) =>
    tabMessenger.sendMessage(type, undefined, tabId),
  );

  void openPanelOnActionClick();

  backgroundMessenger.onMessage('dispatch', ({ data }) => handlers.dispatch(data));
  backgroundMessenger.onMessage('pageState', ({ data, sender }) =>
    handlers.pageState(data.url, sender.tab?.id),
  );
  backgroundMessenger.onMessage('setPendingNote', ({ data, sender }) =>
    handlers.setPendingNote(data, sender.tab),
  );
  backgroundMessenger.onMessage('setSelect', ({ data }) => handlers.setSelect(data.on));
  backgroundMessenger.onMessage('armGrab', () => handlers.armGrab());

  browser.tabs.onActivated.addListener(ignoringRejection(onTabActivated));
  browser.tabs.onUpdated.addListener(
    ignoringRejection(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading') await handlers.tabLoading(tabId);
      await onTabUpdated(tabId, changeInfo, tab);
    }),
  );
  browser.tabs.onRemoved.addListener(ignoringRejection((tabId) => handlers.tabRemoved(tabId)));
  browser.windows.onFocusChanged.addListener(ignoringRejection(onWindowFocusChanged));
  browser.commands.onCommand.addListener(ignoringRejection((name) => handlers.command(name)));
}
