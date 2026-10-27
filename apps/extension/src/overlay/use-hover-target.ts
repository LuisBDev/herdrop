import { type Accessor, createEffect, createSignal, on, onCleanup } from 'solid-js';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { FrameworkInfo } from '../capture/types';
import type { OverlayState } from './overlay-state.ts';
import { createChildStack, fromEvent, labelText } from './selection.ts';

export type Hovered = { el: Element; rect: DOMRect; tag: string; component: string | null };

export type HoverTargetDeps = {
  ctx: Pick<ContentScriptContext, 'addEventListener' | 'requestAnimationFrame'>;
  host: Element;
  state: OverlayState;
  requestFramework: (el: Element) => Promise<FrameworkInfo | null>;
  setSelect: (on: boolean) => Promise<void>;
};

export type HoverTarget = {
  hovered: Accessor<Hovered | null>;
  up(): void;
  down(): void;
  stop(): void;
};

const BLOCKED = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'] as const;

export function createHoverTarget(deps: HoverTargetDeps): HoverTarget {
  const { ctx, host, state } = deps;
  const [hovered, setHovered] = createSignal<Hovered | null>(null);
  const stack = createChildStack();
  const components = new WeakMap<Element, Promise<string | null>>();
  let current: Element | null = null;
  let component: string | null = null;
  let lastPointer: Element | null = null;
  let frame = 0;

  const activeMode = (): 'select' | 'grab' | null => {
    const mode = state.mode();
    return mode === 'off' ? null : mode;
  };

  const componentOf = (el: Element): Promise<string | null> => {
    let pending = components.get(el);
    if (!pending) {
      pending = deps
        .requestFramework(el)
        .then((info) => info?.components.at(-1) ?? null)
        .catch(() => null);
      components.set(el, pending);
    }
    return pending;
  };

  const measure = () => {
    cancelAnimationFrame(frame);
    frame = ctx.requestAnimationFrame(() => {
      const el = current;
      if (!el) return;
      setHovered({ el, rect: el.getBoundingClientRect(), ...labelText(el, component) });
    });
  };

  const target = (el: Element) => {
    if (el === current) return;
    current = el;
    component = null;
    measure();
    void componentOf(el).then((name) => {
      if (current !== el) return;
      component = name;
      setHovered((prev) => (prev?.el === el ? { ...prev, component: name } : prev));
    });
  };

  const clear = () => {
    cancelAnimationFrame(frame);
    current = null;
    component = null;
    lastPointer = null;
    stack.reset();
    setHovered(null);
  };

  const insideHost = (e: Event) => e.composedPath().includes(host);

  const onPointer = (e: Event) => {
    const el = fromEvent(e, host);
    if (!el || el === lastPointer) return;
    lastPointer = el;
    stack.reset();
    target(el);
  };

  const up = () => {
    if (!current) return;
    const parent = stack.up(current);
    if (parent) target(parent);
  };

  const down = () => {
    if (!current) return;
    const child = stack.down(current);
    if (child) target(child);
  };

  const stop = () => {
    const mode = activeMode();
    if (mode === 'select') {
      void deps.setSelect(false).catch(() => undefined);
      state.announce('Selection off');
    } else if (mode === 'grab') {
      state.disarmGrab();
      state.announce('Grab cancelled');
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (insideHost(e)) return;
    const mode = activeMode();
    if (!mode) return;
    switch (e.key) {
      case 'ArrowUp':
        up();
        break;
      case 'ArrowDown':
        down();
        break;
      case 'Enter': {
        const el = hovered()?.el;
        if (el) state.pick(el, mode);
        break;
      }
      case 'Escape':
        stop();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const block = (e: Event) => {
    if (insideHost(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  const onClick = (e: Event) => {
    if (insideHost(e)) return;
    block(e);
    const mode = activeMode();
    if (!mode) return;
    const clicked = fromEvent(e, host);
    const el = hovered()?.el;
    const picked = el && clicked && el.contains(clicked) ? el : clicked;
    if (picked) state.pick(picked, mode);
  };

  const remeasure = () => {
    if (current) measure();
  };

  const attach = () => {
    const removers: (() => void)[] = [];
    const listen = (
      target: EventTarget,
      type: string,
      handler: (e: Event) => void,
      options: AddEventListenerOptions,
    ) => {
      ctx.addEventListener(target, type, handler, options);
      removers.push(() => target.removeEventListener(type, handler, options));
    };
    const capture = { capture: true };
    listen(document, 'pointermove', onPointer, capture);
    listen(document, 'mouseover', onPointer, capture);
    listen(document, 'keydown', onKey as (e: Event) => void, capture);
    for (const type of BLOCKED) listen(document, type, block, capture);
    listen(document, 'click', onClick, capture);
    listen(document, 'scroll', remeasure, { capture: true, passive: true });
    listen(window, 'resize', remeasure, {});
    return () => {
      for (const remove of removers) remove();
      clear();
    };
  };

  createEffect(
    on(
      () => state.mode() !== 'off',
      (active) => {
        if (active) onCleanup(attach());
      },
    ),
  );

  return { hovered, up, down, stop };
}
