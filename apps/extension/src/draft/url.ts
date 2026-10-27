export function normalizeUrl(href: string): string {
  try {
    const url = new URL(href);
    return url.origin + url.pathname;
  } catch {
    return href;
  }
}
