export type Position = { left: number; top: number };
export type Size = { w: number; h: number };
export type Viewport = { width: number; height: number };
export type NudgeKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

const MARGIN = 8;
const GAP = 12;
const STEP = 16;
const SHIFT_STEP = 48;
const DEFAULT_SIZE: Size = { w: 380, h: 300 };

export function clamp(pos: Position, size: Size, viewport: Viewport): Position {
  const maxLeft = Math.max(MARGIN, viewport.width - size.w - MARGIN);
  const maxTop = Math.max(MARGIN, viewport.height - size.h - MARGIN);
  return {
    left: Math.min(Math.max(pos.left, MARGIN), maxLeft),
    top: Math.min(Math.max(pos.top, MARGIN), maxTop),
  };
}

export function initialPosition(
  target: DOMRect | null,
  viewport: Viewport,
  size: Size = DEFAULT_SIZE,
): Position {
  if (target === null) return { left: MARGIN, top: MARGIN };
  const rightLeft = target.right + GAP;
  if (rightLeft + size.w + MARGIN <= viewport.width) {
    return clamp({ left: rightLeft, top: target.top }, size, viewport);
  }
  const leftLeft = target.left - GAP - size.w;
  if (leftLeft >= MARGIN) {
    return clamp({ left: leftLeft, top: target.top }, size, viewport);
  }
  return clamp({ left: target.left, top: target.bottom + GAP }, size, viewport);
}

export function nudge(pos: Position, key: NudgeKey, shift: boolean): Position {
  const step = shift ? SHIFT_STEP : STEP;
  switch (key) {
    case 'ArrowLeft':
      return { left: pos.left - step, top: pos.top };
    case 'ArrowRight':
      return { left: pos.left + step, top: pos.top };
    case 'ArrowUp':
      return { left: pos.left, top: pos.top - step };
    case 'ArrowDown':
      return { left: pos.left, top: pos.top + step };
  }
}
