import { describe, expect, it } from 'vitest';
import { clamp, initialPosition, nudge } from './placement.ts';

const viewport = { width: 1280, height: 800 };
const rect = (x: number, y: number, w: number, h: number) => new DOMRect(x, y, w, h);

describe('placement', () => {
  it('placement', () => {
    expect(initialPosition(null, viewport)).toEqual({ left: 8, top: 8 });
    expect(initialPosition(rect(100, 100, 200, 40), viewport)).toEqual({ left: 312, top: 100 });
    expect(initialPosition(rect(900, 100, 300, 40), viewport)).toEqual({ left: 508, top: 100 });
    expect(initialPosition(rect(20, 100, 1240, 40), viewport)).toEqual({ left: 20, top: 152 });
    expect(initialPosition(rect(100, 700, 200, 40), viewport)).toEqual({ left: 312, top: 492 });
    expect(clamp({ left: -50, top: 900 }, { w: 380, h: 300 }, viewport)).toEqual({
      left: 8,
      top: 492,
    });
    expect(nudge({ left: 100, top: 100 }, 'ArrowLeft', false)).toEqual({ left: 84, top: 100 });
    expect(nudge({ left: 100, top: 100 }, 'ArrowDown', false)).toEqual({ left: 100, top: 116 });
    expect(nudge({ left: 100, top: 100 }, 'ArrowRight', true)).toEqual({ left: 148, top: 100 });
    expect(nudge({ left: 100, top: 100 }, 'ArrowUp', true)).toEqual({ left: 100, top: 52 });
  });
});
