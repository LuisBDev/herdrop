import { browser } from 'wxt/browser';
import type { Draft } from '../draft/model.ts';
import type { PageState, UiState } from '../messaging/types.ts';
import { pageStateFor } from './page-state.ts';
import { isWebUrl } from './target-tab.ts';

export function createBroadcast(
  send: (tabId: number, state: PageState) => Promise<void>,
): (draft: Draft, ui: UiState) => Promise<void> {
  return async (draft, ui) => {
    const tabs = await browser.tabs.query({});
    await Promise.allSettled(
      tabs.flatMap(({ id, url }) =>
        id !== undefined && isWebUrl(url) ? [send(id, pageStateFor({ id, url }, draft, ui))] : [],
      ),
    );
  };
}
