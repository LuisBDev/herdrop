import type { Settings } from '../messaging/types.ts';
import type { settingsItem } from '../storage/items.ts';
import { resolveTheme } from '../theme/resolve.ts';

export function startHostTheme(
  host: HTMLElement,
  deps: { settings: typeof settingsItem; media: MediaQueryList },
): () => void {
  let pref: Settings['theme'];
  let changed = false;
  let stopped = false;
  const apply = () => {
    if (!stopped) host.dataset.theme = resolveTheme(pref, deps.media.matches);
  };
  const unwatch = deps.settings.watch((next) => {
    changed = true;
    pref = next.theme;
    apply();
  });
  const onMedia = () => apply();
  deps.media.addEventListener('change', onMedia);
  apply();
  void (async () => {
    const stored = await deps.settings.getValue();
    if (changed) return;
    pref = stored.theme;
    apply();
  })();
  return () => {
    stopped = true;
    unwatch();
    deps.media.removeEventListener('change', onMedia);
  };
}
