import { describe, expect, it } from 'vitest';
import type { PageAnnotation } from '../messaging/types.ts';
import { isOffscreen, layoutMarkers, locate } from './locate.ts';

const viewport = { width: 1280, height: 800 };
const rect = (x: number, y: number, w: number, h: number) => new DOMRect(x, y, w, h);

const annotation = (id: string, number: number, selector: string): PageAnnotation => ({
  id,
  number,
  intent: 'fix',
  priority: null,
  comment: '',
  selector,
  component: null,
  elementTag: 'div',
  elementLabel: '',
});

describe('locate', () => {
  it('locate_handles_invalid_and_escaped_selectors', () => {
    document.body.innerHTML = '<p class="md:px-4">x</p>';
    expect(locate('p[')).toBeNull();
    expect(locate(String.raw`p.md\:px-4`)).toBe(document.querySelector('p'));
  });

  it('offscreen_when_outside_viewport_or_missing', () => {
    const cases: [DOMRect | null, boolean][] = [
      [null, true],
      [rect(10, 10, 0, 0), true],
      [rect(10, -50, 100, 50), true],
      [rect(10, 800, 100, 50), true],
      [rect(-100, 10, 100, 50), true],
      [rect(1280, 10, 100, 50), true],
      [rect(10, -10, 100, 50), false],
      [rect(10, 10, 100, 50), false],
    ];
    for (const [r, expected] of cases) expect(isOffscreen(r, viewport)).toBe(expected);
  });

  it('layout_markers', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const rects = new Map<Element, DOMRect>([
      [a, rect(40, 60, 100, 20)],
      [b, rect(5, 5, 10, 10)],
    ]);
    for (const [el, r] of rects) el.getBoundingClientRect = () => r;
    const els: Record<string, Element> = { '#a': a, '#b': b };
    const find = (s: string) => els[s] ?? null;
    const list = [annotation('1', 1, '#a'), annotation('2', 2, '#gone'), annotation('3', 3, '#b')];
    expect(layoutMarkers(list, find, viewport, '3')).toEqual({
      markers: [{ id: '1', number: 1, intent: 'fix', left: 40, top: 60 }],
      offscreen: ['2'],
    });
  });
});
