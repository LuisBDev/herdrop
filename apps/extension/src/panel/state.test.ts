import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { targetTabItem } from '../storage/items.ts';
import { createGrabTracker, createPanelState } from './state.ts';

afterEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

it('site_access_follows_target_and_permission_changes', async () => {
  const contains = vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false as never);
  const added: Array<() => void> = [];
  vi.spyOn(browser.permissions.onAdded, 'addListener').mockImplementation((listener) => {
    added.push(listener as () => void);
  });
  vi.spyOn(browser.permissions.onAdded, 'removeListener').mockImplementation(() => undefined);
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(() => undefined);
  vi.spyOn(browser.permissions.onRemoved, 'removeListener').mockImplementation(() => undefined);
  await targetTabItem.setValue({ id: 1, url: 'chrome-extension://abc/sidepanel.html' });

  await createRoot(async (dispose) => {
    const state = createPanelState();
    await vi.waitFor(() => expect(state.targetTab()?.id).toBe(1));
    expect(state.siteAccess()).toBe('not_web');

    await targetTabItem.setValue({ id: 2, url: 'http://localhost:4200/invoices' });
    await vi.waitFor(() => expect(state.siteAccess()).toBe('missing'));

    contains.mockResolvedValue(true as never);
    for (const listener of added) listener();
    await vi.waitFor(() => expect(state.siteAccess()).toBe('granted'));
    dispose();
  });
});

it('grab_armed_counts_only_target_tab_and_resets_on_target_change', () => {
  const { grabArmed, onGrabChanged, setTarget } = createGrabTracker();
  setTarget(1);

  onGrabChanged({ data: { armed: true }, sender: { tab: { id: 7 } } });
  expect(grabArmed()).toBe(false);

  onGrabChanged({ data: { armed: true }, sender: { tab: { id: 1 } } });
  setTarget(1);
  expect(grabArmed()).toBe(true);

  setTarget(2);
  expect(grabArmed()).toBe(false);
  onGrabChanged({ data: { armed: true }, sender: { tab: { id: 1 } } });
  expect(grabArmed()).toBe(false);

  setTarget(1);
  expect(grabArmed()).toBe(false);
});
