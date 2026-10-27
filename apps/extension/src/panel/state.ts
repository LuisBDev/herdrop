import { type Accessor, createContext, createSignal, onCleanup, useContext } from 'solid-js';
import { browser } from 'wxt/browser';
import type { WxtStorageItem } from 'wxt/utils/storage';
import type { DispatchResult, Draft, DraftEvent } from '../draft/model.ts';
import { backgroundMessenger } from '../messaging/background.ts';
import { panelMessenger } from '../messaging/panel.ts';
import { tabMessenger } from '../messaging/tab.ts';
import type { TabProtocol, TargetTab, UiState } from '../messaging/types.ts';
import { hasSiteAccess, originPattern } from '../site/access.ts';
import { draftItem, targetTabItem, uiItem } from '../storage/items.ts';
import { createFeedback, type Feedback } from './feedback.ts';

export type SiteAccess = 'granted' | 'missing' | 'not_web';

export type PanelState = {
  draft: Accessor<Draft>;
  ui: Accessor<UiState>;
  targetTab: Accessor<TargetTab | null>;
  siteAccess: Accessor<SiteAccess>;
  grabArmed: Accessor<boolean>;
  dispatch(event: DraftEvent): Promise<DispatchResult>;
  sendBackground: typeof backgroundMessenger.sendMessage;
  sendToTab<K extends keyof TabProtocol>(
    type: K,
    data: Parameters<TabProtocol[K]>[0],
  ): Promise<void>;
  feedback: Feedback;
};

export type GrabChangedMessage = {
  data: { armed: boolean };
  sender: { tab?: { id?: number } };
};

export type GrabTracker = {
  grabArmed: Accessor<boolean>;
  onGrabChanged(message: GrabChangedMessage): void;
  setTarget(tabId: number | null): void;
};

type SendToTab = (type: keyof TabProtocol, data: unknown, tabId: number) => Promise<unknown>;

export function createGrabTracker(): GrabTracker {
  const [grabArmed, setGrabArmed] = createSignal(false);
  let targetId: number | null = null;
  return {
    grabArmed,
    onGrabChanged(message) {
      if (targetId !== null && message.sender.tab?.id === targetId) {
        setGrabArmed(message.data.armed);
      }
    },
    setTarget(tabId) {
      if (tabId === targetId) return;
      targetId = tabId;
      setGrabArmed(false);
    },
  };
}

function storedSignal<T>(
  item: WxtStorageItem<T, Record<string, unknown>>,
  onChange: (value: T) => void = () => undefined,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(item.fallback);
  const apply = (next: T) => {
    setValue(() => next);
    onChange(next);
  };
  onCleanup(item.watch(apply));
  void item.getValue().then(apply);
  return value;
}

function createSiteAccess(url: () => string | undefined) {
  const [siteAccess, setSiteAccess] = createSignal<SiteAccess>('not_web');
  let check = 0;
  const refresh = async () => {
    const run = ++check;
    const current = url();
    if (current === undefined || originPattern(current) === null) {
      setSiteAccess('not_web');
      return;
    }
    const granted = await hasSiteAccess(current).catch(() => false);
    if (run === check) setSiteAccess(granted ? 'granted' : 'missing');
  };
  const onPermissionsChanged = () => void refresh();
  browser.permissions.onAdded.addListener(onPermissionsChanged);
  browser.permissions.onRemoved.addListener(onPermissionsChanged);
  onCleanup(() => {
    browser.permissions.onAdded.removeListener(onPermissionsChanged);
    browser.permissions.onRemoved.removeListener(onPermissionsChanged);
  });
  return { siteAccess, refresh: onPermissionsChanged };
}

export function createPanelState(deps: { feedback?: Feedback } = {}): PanelState {
  const grab = createGrabTracker();
  const draft = storedSignal(draftItem);
  const ui = storedSignal(uiItem);
  const targetTab = storedSignal(targetTabItem, (next) => {
    grab.setTarget(next?.id ?? null);
    site.refresh();
  });
  const site = createSiteAccess(() => targetTab()?.url);
  onCleanup(panelMessenger.onMessage('grabChanged', grab.onGrabChanged));
  const sendTab = tabMessenger.sendMessage as SendToTab;

  return {
    draft,
    ui,
    targetTab,
    siteAccess: site.siteAccess,
    grabArmed: grab.grabArmed,
    dispatch: (event) => backgroundMessenger.sendMessage('dispatch', event),
    sendBackground: backgroundMessenger.sendMessage,
    async sendToTab(type, data) {
      const target = targetTab();
      if (target === null) return;
      try {
        await sendTab(type, data, target.id);
      } catch {
        return;
      }
    },
    feedback: deps.feedback ?? createFeedback(),
  };
}

export const PanelContext = createContext<PanelState>();

export function usePanel(): PanelState {
  const state = useContext(PanelContext);
  if (state === undefined) throw new Error('usePanel must be used inside PanelContext.Provider');
  return state;
}
