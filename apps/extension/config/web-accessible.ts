const CONTENT_SCRIPT_CSS = /^content-scripts\/.+\.css$/;
const GRANTABLE_MATCHES = ['http://*/*', 'https://*/*'];

function isContentScriptCssEntry(
  entry: unknown,
): entry is { resources: string[]; matches?: string[] } {
  if (typeof entry !== 'object' || entry === null) return false;
  const { resources } = entry as { resources?: unknown };
  return (
    Array.isArray(resources) &&
    resources.length > 0 &&
    resources.every((r) => typeof r === 'string' && CONTENT_SCRIPT_CSS.test(r))
  );
}

export function widenContentScriptCss(manifest: { web_accessible_resources?: unknown[] }): void {
  for (const entry of manifest.web_accessible_resources ?? []) {
    if (isContentScriptCssEntry(entry)) {
      entry.matches = [...GRANTABLE_MATCHES];
    }
  }
}
