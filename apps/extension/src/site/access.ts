import { browser } from 'wxt/browser';

export const BRIDGE_ORIGIN_PATTERN = 'http://127.0.0.1/*';

export function originPattern(url: string): string | null {
  try {
    const { protocol, host } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? `${protocol}//${host}/*` : null;
  } catch {
    return null;
  }
}

export function requestSiteAccess(url: string): Promise<boolean> {
  const pattern = originPattern(url);
  if (pattern === null) return Promise.resolve(false);
  return browser.permissions.request({ origins: [pattern] });
}

export async function hasSiteAccess(url: string): Promise<boolean> {
  const pattern = originPattern(url);
  if (pattern === null) return false;
  return browser.permissions.contains({ origins: [pattern] });
}

export async function grantedSiteOrigins(): Promise<string[]> {
  const { origins } = await browser.permissions.getAll();
  return (origins ?? [])
    .filter((o) => (o.startsWith('http://') || o.startsWith('https://')) && o !== BRIDGE_ORIGIN_PATTERN)
    .sort();
}
