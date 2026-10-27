import { afterEach, beforeEach, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { settingsItem } from '../storage/items.ts';
import { startPanelTheme } from './theme.ts';

function stubMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  return {
    media: media as unknown as MediaQueryList,
    set(next: boolean) {
      media.matches = next;
      for (const fn of listeners) fn();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let theme: ReturnType<typeof startPanelTheme> | undefined;

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  theme?.stop();
  theme = undefined;
});

it('follows_system_media_until_overridden', async () => {
  const root = document.createElement('div');
  const system = stubMedia(false);
  theme = startPanelTheme({ settings: settingsItem, media: system.media, root });
  await flush();
  expect(root.dataset.theme).toBe('light');
  system.set(true);
  expect(root.dataset.theme).toBe('dark');
  await settingsItem.setValue({ theme: 'light' });
  await flush();
  system.set(false);
  system.set(true);
  expect(root.dataset.theme).toBe('light');
});

it('toggle_stores_opposite_of_effective_and_keeps_port', async () => {
  const root = document.createElement('div');
  const system = stubMedia(true);
  await settingsItem.setValue({ bridgePort: 5000 });
  theme = startPanelTheme({ settings: settingsItem, media: system.media, root });
  await flush();
  expect(root.dataset.theme).toBe('dark');
  await theme.toggle();
  await flush();
  expect(await settingsItem.getValue()).toEqual({ bridgePort: 5000, theme: 'light' });
  expect(root.dataset.theme).toBe('light');
});
