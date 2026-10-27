import { expect, it, vi } from 'vitest';
import { captureTarget } from '../capture/target.ts';
import { renderGrab } from '../render/grab.ts';
import { grabElement } from './grab.ts';

function deps(copy: (text: string) => Promise<boolean>) {
  const copied: string[] = [];
  return {
    copied,
    toast: vi.fn(),
    announce: vi.fn(),
    disarm: vi.fn(),
    deps: {
      capture: (el: Element) =>
        captureTarget(
          el,
          '',
          () =>
            new Promise((resolve) =>
              setTimeout(
                () => resolve({ kind: 'react', components: ['App', 'StatCard'], sourceFile: null }),
                0,
              ),
            ),
        ),
      render: renderGrab,
      copy: async (text: string) => {
        copied.push(text);
        return copy(text);
      },
    },
  };
}

function target(): Element {
  document.body.innerHTML = '<p class="stat" id="t">Revenue</p>';
  const el = document.getElementById('t');
  if (!el) throw new Error('missing target');
  return el;
}

it('grab_capture_carries_the_framework', async () => {
  const d = deps(async () => true);
  await grabElement(target(), {
    ...d.deps,
    toast: d.toast,
    announce: d.announce,
    disarm: d.disarm,
  });
  expect(d.copied[0]).toContain('StatCard');
  expect(d.toast).toHaveBeenCalledWith('Copied element context', 'StatCard p.stat');
  expect(d.announce).toHaveBeenCalledWith('Copied element context: StatCard p.stat');
  expect(d.disarm).toHaveBeenCalledOnce();
});

it('failed_copy_shows_retry_toast_and_still_disarms', async () => {
  const d = deps(async () => false);
  await grabElement(target(), {
    ...d.deps,
    toast: d.toast,
    announce: d.announce,
    disarm: d.disarm,
  });
  expect(d.toast).toHaveBeenCalledWith('Copy failed. Click the page and try again.', '');
  expect(d.announce).not.toHaveBeenCalled();
  expect(d.disarm).toHaveBeenCalledOnce();
});
