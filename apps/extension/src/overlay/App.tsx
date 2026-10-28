import type { GetDataType } from '@webext-core/messaging';
import { onCleanup } from 'solid-js';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { captureTarget } from '../capture/target.ts';
import { requestFramework } from '../inspector/channel.ts';
import { backgroundMessenger } from '../messaging/background.ts';
import { panelMessenger } from '../messaging/panel.ts';
import { tabMessenger } from '../messaging/tab.ts';
import type { PanelProtocol } from '../messaging/types.ts';
import { renderGrab } from '../render/grab.ts';
import { settingsItem } from '../storage/items.ts';
import { grabElement } from './grab.ts';
import { Highlight } from './Highlight.tsx';
import { startHostTheme } from './host-theme.ts';
import { locate } from './locate.ts';
import { Markers } from './Markers.tsx';
import { NoteLayer } from './NoteLayer.tsx';
import { createNoteController } from './note-controller.ts';
import { createOverlayState, OverlayContext } from './overlay-state.ts';
import { createPageToast, PageToast } from './PageToast.tsx';
import { copyTextOnPage } from './page-clipboard.ts';
import { SelectionBar } from './SelectionBar.tsx';
import { selectedText } from './selection.ts';
import { createHoverTarget } from './use-hover-target.ts';
import { createVisibilityReporter } from './visibility.ts';

async function notifyPanel<K extends keyof PanelProtocol>(
  type: K,
  data: Parameters<PanelProtocol[K]>[0],
): Promise<void> {
  try {
    await panelMessenger.sendMessage(type, data as GetDataType<PanelProtocol[K]>);
  } catch {}
}

export function App(props: { ctx: ContentScriptContext; shadow: ShadowRoot; host: HTMLElement }) {
  let container: HTMLDivElement | undefined;
  const capture = (el: Element) => captureTarget(el, selectedText(), requestFramework);

  onCleanup(
    startHostTheme(props.host, {
      settings: settingsItem,
      media: matchMedia('(prefers-color-scheme: dark)'),
    }),
  );

  const state = createOverlayState({
    getPageState: (url) => backgroundMessenger.sendMessage('pageState', { url }),
    notifyPanel,
    url: () => location.href,
  });

  const hover = createHoverTarget({
    ctx: props.ctx,
    host: props.host,
    state,
    requestFramework,
    setSelect: (on) => backgroundMessenger.sendMessage('setSelect', { on }),
  });

  const toast = createPageToast();
  onCleanup(
    state.onPick('grab', (el) => {
      void grabElement(el, {
        capture,
        render: renderGrab,
        copy: (text) => (container ? copyTextOnPage(text, container) : Promise.resolve(false)),
        toast: toast.show,
        announce: state.announce,
        disarm: state.disarmGrab,
      });
    }),
  );

  const controller = createNoteController({
    state,
    capture,
    dispatch: (e) => backgroundMessenger.sendMessage('dispatch', e),
    setPendingNote: (n) => backgroundMessenger.sendMessage('setPendingNote', n),
    locate: (selector) => locate(selector),
    viewport: () => ({ width: innerWidth, height: innerHeight }),
    newId: () => crypto.randomUUID(),
  });
  onCleanup(
    state.onPick('select', (el) => {
      void controller.openNew(el);
    }),
  );

  const reporter = createVisibilityReporter(
    (data) => notifyPanel('visibilityChanged', data),
    () => location.href,
  );

  const listeners = [
    tabMessenger.onMessage('pageStateChanged', ({ data }) => state.applyPageState(data)),
    tabMessenger.onMessage('armGrab', () => state.armGrab()),
    tabMessenger.onMessage('disarmGrab', () => state.disarmGrab()),
    tabMessenger.onMessage('highlightAnnotation', ({ data }) => state.setLinked(data.id, false)),
    tabMessenger.onMessage('openEditor', ({ data }) => controller.openEdit(data.annotationId)),
    tabMessenger.onMessage('closeEditor', ({ data }) => controller.closeEditor(data.annotationId)),
    tabMessenger.onMessage('reportVisibility', () => reporter.report()),
  ];
  onCleanup(() => {
    for (const remove of listeners) remove();
  });

  const refresh = () => state.refresh().catch(() => undefined);
  void (async () => {
    await refresh();
    controller.start();
  })();
  props.ctx.addEventListener(window, 'wxt:locationchange', () => void refresh());
  props.ctx.addEventListener(window, 'pagehide', () => {
    backgroundMessenger.sendMessage('setPendingNote', null).catch(() => undefined);
  });

  return (
    <OverlayContext.Provider value={state}>
      <div class="hd" ref={container}>
        <Highlight hover={hover} />
        <SelectionBar hover={hover} />
        <Markers ctx={props.ctx} controller={controller} reporter={reporter} />
        <NoteLayer ctx={props.ctx} controller={controller} />
        <PageToast toast={toast} />
        <p class="sr" role="status" aria-live="polite">
          {state.live()}
        </p>
      </div>
    </OverlayContext.Provider>
  );
}
