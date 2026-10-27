import { afterEach, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { settingsItem } from '../storage/items.ts';
import { startHostTheme } from './host-theme.ts';

function stubMedia(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  } as MediaQueryList;
}

afterEach(() => {
  fakeBrowser.reset();
});

it('host_follows_system_until_a_stored_override', async () => {
  await settingsItem.setValue({ theme: 'system' });
  const followsSystem = document.createElement('div');
  const stopSystem = startHostTheme(followsSystem, {
    settings: settingsItem,
    media: stubMedia(true),
  });
  await vi.waitFor(() => expect(followsSystem.dataset.theme).toBe('dark'));
  stopSystem();

  await settingsItem.setValue({ theme: 'light' });
  const overridden = document.createElement('div');
  const stopOverride = startHostTheme(overridden, {
    settings: settingsItem,
    media: stubMedia(true),
  });
  await vi.waitFor(() => expect(overridden.dataset.theme).toBe('light'));
  stopOverride();
});

it('storage_change_updates_host', async () => {
  await settingsItem.setValue({ theme: 'light' });
  const host = document.createElement('div');
  const stop = startHostTheme(host, { settings: settingsItem, media: stubMedia(false) });
  await vi.waitFor(() => expect(host.dataset.theme).toBe('light'));
  await settingsItem.setValue({ theme: 'dark' });
  await vi.waitFor(() => expect(host.dataset.theme).toBe('dark'));
  stop();
});
