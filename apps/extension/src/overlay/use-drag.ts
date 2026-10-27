import { type Accessor, createSignal, onCleanup } from 'solid-js';
import { clamp, type Position, type Size } from './placement.ts';

export type DragOptions = {
  origin: () => Position;
  size: () => Size;
  onMove: (pos: Position) => void;
};

export function useDrag(opts: DragOptions): {
  dragging: Accessor<boolean>;
  onPointerDown: (e: PointerEvent) => void;
} {
  const [dragging, setDragging] = createSignal(false);
  let release: (() => void) | null = null;

  const end = () => {
    release?.();
    release = null;
    setDragging(false);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const button = e.target instanceof Element ? e.target.closest('button') : null;
    if (button !== null && !button.hasAttribute('data-grip')) return;
    end();
    const start = opts.origin();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev: PointerEvent) => {
      const next = { left: start.left + ev.clientX - x0, top: start.top + ev.clientY - y0 };
      opts.onMove(
        clamp(next, opts.size(), { width: window.innerWidth, height: window.innerHeight }),
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    release = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    setDragging(true);
  };

  onCleanup(end);

  return { dragging, onPointerDown };
}
