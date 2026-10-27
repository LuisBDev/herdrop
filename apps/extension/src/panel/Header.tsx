import { Droplet, Hand, Moon, MousePointer2, Sun } from 'lucide-solid';
import { type Accessor, createMemo, Show } from 'solid-js';
import { headerView } from './header-view.ts';
import { usePanel } from './state.ts';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';

export function Header(props: {
  theme: { effective: Accessor<'light' | 'dark'>; toggle(): Promise<void> };
}) {
  const panel = usePanel();
  const view = createMemo(() =>
    headerView({
      phase: panel.draft().phase,
      hasDestination: panel.draft().phase !== 'no_destination',
      access: panel.siteAccess(),
      selectOn: panel.ui().selectOn,
      grabArmed: panel.grabArmed(),
      pending: panel.ui().pending !== null,
    }),
  );

  const grab = () => {
    const { unavailable, pressed } = view().grab;
    if (unavailable) return;
    if (pressed) {
      void panel.sendToTab('disarmGrab', undefined);
      panel.feedback.announce('Grab cancelled');
      return;
    }
    void panel.sendBackground('armGrab', undefined).catch(() => undefined);
    panel.feedback.announce('Grab: click an element to copy its context');
  };

  const select = () => {
    const { unavailable, pressed } = view().select;
    if (unavailable) return;
    if (pressed) {
      void panel.sendBackground('setSelect', { on: false }).catch(() => undefined);
      panel.feedback.announce('Selection off');
      return;
    }
    void panel.sendBackground('setSelect', { on: true }).catch(() => undefined);
    if (panel.grabArmed()) void panel.sendToTab('disarmGrab', undefined);
    panel.feedback.announce('Selection on');
  };

  const dark = () => props.theme.effective() === 'dark';
  const themeLabel = () => (dark() ? 'Switch to light theme' : 'Switch to dark theme');

  return (
    <header class="flex h-[52px] flex-none items-center justify-between gap-2 border-b border-hairline pr-2 pl-4">
      <div class="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.2px]">
        <Droplet size={20} aria-hidden="true" class="text-primary" />
        Herdrop
      </div>
      <div class="flex items-center gap-1">
        <Tooltip content={view().grab.tip}>
          <Button
            variant="toggle"
            size="sm"
            aria-pressed={view().grab.pressed}
            aria-disabled={view().grab.unavailable ? 'true' : undefined}
            onClick={grab}
          >
            <Hand size={16} aria-hidden="true" />
            Grab
          </Button>
        </Tooltip>
        <Tooltip content={view().select.tip}>
          <Button
            variant="toggle"
            size="sm"
            aria-pressed={view().select.pressed}
            aria-disabled={view().select.unavailable ? 'true' : undefined}
            onClick={select}
          >
            <MousePointer2 size={16} aria-hidden="true" />
            {view().select.label}
          </Button>
        </Tooltip>
        <Tooltip content={themeLabel()} placement="bottom-end">
          <Button
            variant="ghost"
            size="icon"
            aria-label={themeLabel()}
            onClick={() => void props.theme.toggle()}
          >
            <Show when={dark()} fallback={<Moon size={16} aria-hidden="true" />}>
              <Sun size={16} aria-hidden="true" />
            </Show>
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
