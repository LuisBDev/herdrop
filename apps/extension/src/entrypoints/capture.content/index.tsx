import { render } from 'solid-js/web';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { App } from '../../overlay/App';
import '../../overlay/overlay.css';

export default defineContentScript({
  matches: ['http://127.0.0.1/*'],
  registration: 'runtime',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const root = document.documentElement;
    if (root.hasAttribute('data-herdrop')) return;
    root.setAttribute('data-herdrop', '');
    ctx.onInvalidated(() => root.removeAttribute('data-herdrop'));
    const ui = await createShadowRootUi(ctx, {
      name: 'herdrop-overlay',
      position: 'inline',
      anchor: 'body',
      isolateEvents: true,
      onMount: (container, shadow, host) =>
        render(() => <App ctx={ctx} shadow={shadow} host={host} />, container),
      onRemove: (dispose) => dispose?.(),
    });
    ui.mount();
  },
});
