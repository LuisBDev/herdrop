import { type Accessor, createSignal } from 'solid-js';
import type { settingsItem } from '../storage/items.ts';
import { resolveTheme } from '../theme/resolve.ts';

type Deps = {
  settings: typeof settingsItem;
  media: MediaQueryList;
  root: HTMLElement;
};

export function startPanelTheme({ settings, media, root }: Deps) {
  let pref: 'system' | 'light' | 'dark' | undefined;
  const [effective, setEffective] = createSignal<'light' | 'dark'>(
    resolveTheme(pref, media.matches),
  );

  const apply = () => {
    const next = resolveTheme(pref, media.matches);
    root.dataset.theme = next;
    setEffective(next);
  };

  const onMedia = () => apply();
  media.addEventListener('change', onMedia);
  apply();

  const unwatch = settings.watch((value) => {
    pref = value?.theme;
    apply();
  });

  settings.getValue().then((value) => {
    pref = value.theme;
    apply();
  });

  return {
    effective: effective as Accessor<'light' | 'dark'>,
    async toggle() {
      const current = await settings.getValue();
      const next = effective() === 'dark' ? 'light' : 'dark';
      await settings.setValue({ ...current, theme: next });
    },
    stop() {
      media.removeEventListener('change', onMedia);
      unwatch();
    },
  };
}
