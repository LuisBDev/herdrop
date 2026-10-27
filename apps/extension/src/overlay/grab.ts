import type { Capture } from '../capture/types.ts';
import { componentName, elementTag } from '../render/label.ts';

type GrabDeps = {
  capture: (el: Element) => Promise<Capture>;
  render: (c: Capture) => string;
  copy: (text: string) => Promise<boolean>;
  toast: (text: string, sub: string) => void;
  announce: (text: string) => void;
  disarm: () => void;
};

export async function grabElement(el: Element, deps: GrabDeps): Promise<void> {
  const captured = await deps.capture(el);
  const copied = await deps.copy(deps.render(captured));
  deps.disarm();
  if (!copied) {
    deps.toast('Copy failed. Click the page and try again.', '');
    return;
  }
  const sub = [componentName(captured), elementTag(captured)].filter(Boolean).join(' ');
  deps.toast('Copied element context', sub);
  deps.announce(`Copied element context: ${sub}`);
}
