import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, expect, it, vi } from 'vitest';
import { grantedSiteOrigins, originPattern, requestSiteAccess } from './access';

afterEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

it('origin_pattern_table', () => {
  expect(originPattern('http://localhost:4200/invoices?x=1')).toBe('http://localhost:4200/*');
  expect(originPattern('chrome://extensions/')).toBeNull();
  expect(originPattern('file:///C:/a.html')).toBeNull();
  expect(originPattern('not a url')).toBeNull();
});

it('request_is_called_synchronously', async () => {
  const request = vi.spyOn(browser.permissions, 'request').mockResolvedValue(true as never);
  const pending = requestSiteAccess('https://app.example.com/x');
  expect(request).toHaveBeenCalledWith({ origins: ['https://app.example.com/*'] });
  expect(await pending).toBe(true);
});

it('granted_origins_exclude_the_bridge_and_non_http', async () => {
  vi.spyOn(browser.permissions, 'getAll').mockResolvedValue({
    origins: ['https://b.example.com/*', 'http://127.0.0.1/*', 'chrome://favicon/*', 'http://a.test:3000/*'],
    permissions: [],
  } as never);
  expect(await grantedSiteOrigins()).toEqual(['http://a.test:3000/*', 'https://b.example.com/*']);
});
