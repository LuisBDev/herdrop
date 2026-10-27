import { ShieldCheck } from 'lucide-solid';
import { createMemo, Show } from 'solid-js';
import { requestSiteAccess } from '../site/access.ts';
import { accessBannerView } from './header-view.ts';
import { usePanel } from './state.ts';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';

type BannerTarget = { url: string; tabId: number; host: string };

export function AccessBanner() {
  const panel = usePanel();
  const target = createMemo<BannerTarget | null>(() => {
    const tab = panel.targetTab();
    if (tab === null) return null;
    const view = accessBannerView(tab.url, panel.siteAccess());
    return view.show ? { url: tab.url, tabId: tab.id, host: view.host } : null;
  });

  const allow = ({ url, tabId, host }: BannerTarget) => {
    const granted = requestSiteAccess(url);
    granted
      .then((ok) => {
        if (!ok) return;
        void panel.sendBackground('syncSiteAccess', { tabId }).catch(() => undefined);
        panel.feedback.announce(`Access granted for ${host}`);
      })
      .catch(() => undefined);
  };

  return (
    <Show when={target()}>
      {(banner) => (
        <section
          aria-label="Site access"
          class="mx-4 mt-3 flex flex-none flex-wrap items-center gap-2.5 rounded-md border border-hairline bg-surface-1 py-2.5 pr-2.5 pl-3 text-ink"
        >
          <ShieldCheck size={20} aria-hidden="true" class="flex-none text-ink-subtle" />
          <span class="min-w-[140px] flex-1 font-medium">No access to {banner().host}</span>
          <Tooltip
            wrap
            content="Lets Herdrop highlight and capture elements on this site. Chrome asks you to confirm. You can pick a destination meanwhile."
          >
            <Button variant="primary" size="sm" onClick={() => allow(banner())}>
              Allow Herdrop on this site
            </Button>
          </Tooltip>
        </section>
      )}
    </Show>
  );
}
