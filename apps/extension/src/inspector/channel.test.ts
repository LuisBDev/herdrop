import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { captureTarget } from '../capture/target';
import type { FrameworkInfo } from '../capture/types';
import { requestFramework, serveInspector } from './channel';

const MARKER = 'data-herdrop-inspect';

function SaveButton() {}

function reactElement(): Element {
  const el = document.createElement('button');
  Object.assign(el, { __reactFiber$test: { type: SaveButton, return: null } });
  document.body.append(el);
  return el;
}

function nextMacrotask(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(() => {
  vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
    setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data, source: window })));
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  document.body.replaceChildren();
});

it('round_trip_and_timeout_remove_the_marker', async () => {
  const el = reactElement();

  expect(await requestFramework(el, 30)).toBeNull();
  expect(el.hasAttribute(MARKER)).toBe(false);

  serveInspector(window);
  expect(await requestFramework(el, 1000)).toEqual({
    kind: 'react',
    components: ['SaveButton'],
    sourceFile: null,
  });
  expect(el.hasAttribute(MARKER)).toBe(false);
});

it('serving_twice_replies_once', async () => {
  serveInspector(window);
  serveInspector(window);
  let replies = 0;
  const count = (event: MessageEvent) => {
    if ((event.data as { source?: unknown }).source === 'herdrop-main') replies += 1;
  };
  window.addEventListener('message', count);
  await requestFramework(reactElement(), 1000);
  await nextMacrotask(20);
  window.removeEventListener('message', count);
  expect(replies).toBe(1);
});

it('spoofed_reply_with_a_bad_shape_is_null', async () => {
  serveInspector(window);
  const spoof = (event: MessageEvent) => {
    const data = event.data as { source?: unknown; nonce?: unknown };
    if (data.source !== 'herdrop-isolated') return;
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          source: 'herdrop-main',
          type: 'inspected',
          nonce: data.nonce,
          framework: { kind: 'vue' },
        },
      }),
    );
  };
  window.addEventListener('message', spoof);
  const el = reactElement();
  const framework = await requestFramework(el, 1000);
  window.removeEventListener('message', spoof);
  expect(framework).toBeNull();
  expect(el.hasAttribute(MARKER)).toBe(false);
});

it('capture_target_waits_for_the_framework', async () => {
  const info: FrameworkInfo = {
    kind: 'angular',
    components: ['InvoiceComponent'],
    sourceFile: null,
  };
  const request = () => nextMacrotask().then(() => info);
  const capture = await captureTarget(reactElement(), '', request);
  expect(capture.framework).toEqual(info);
});
