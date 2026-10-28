import { createRoot } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import type { PageState } from '../messaging/types.ts';
import { createOverlayState } from './overlay-state.ts';
import type { PageContext } from './page-context.ts';
import { createHoverTarget } from './use-hover-target.ts';

const selecting: PageState = {
  selectOn: true,
  canSelect: true,
  nextNumber: 1,
  annotations: [],
  pending: null,
  pendingElsewhere: false,
};

const ctx = {
  addEventListener: (
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ) => target.addEventListener(type, handler, options),
  requestAnimationFrame: (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  },
} as unknown as PageContext;

afterEach(() => {
  document.body.innerHTML = '';
});

it('hover_survives_page_state_push_that_keeps_mode', () => {
  const host = document.createElement('herdrop-overlay');
  const target = document.createElement('p');
  document.body.append(host, target);

  const { state, hover, dispose } = createRoot((dispose) => {
    const state = createOverlayState({
      getPageState: async () => selecting,
      notifyPanel: async () => {},
      url: () => 'http://localhost/',
    });
    state.applyPageState(selecting);
    const hover = createHoverTarget({
      ctx,
      host,
      state,
      requestFramework: async () => null,
      setSelect: async () => {},
    });
    return { state, hover, dispose };
  });

  target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, composed: true }));
  expect(hover.hovered()?.el).toBe(target);

  state.applyPageState({ ...selecting, nextNumber: 2 });
  expect(state.mode()).toBe('select');
  expect(hover.hovered()?.el).toBe(target);
  dispose();
});
