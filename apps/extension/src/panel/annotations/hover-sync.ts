import { type Accessor, createSignal } from 'solid-js';
import type { PanelState } from '../state.ts';

type Sender = { tab?: { id?: number } };
type Registrar<T> = (handler: (msg: { data: T; sender: Sender }) => void) => () => void;

export type HoverSync = {
  enter(id: string): void;
  leave(): void;
  linkedId: Accessor<string | null>;
  linkedFromPage: Accessor<boolean>;
  offscreen: Accessor<ReadonlySet<string>>;
  requestVisibility(): void;
  dispose(): void;
};

export function createHoverSync(deps: {
  sendToTab: PanelState['sendToTab'];
  targetTabId: Accessor<number | null>;
  onLinked: Registrar<{ id: string | null }>;
  onOffscreen: Registrar<{ url: string; offscreen: string[] }>;
}): HoverSync {
  const [linkedId, setLinkedId] = createSignal<string | null>(null);
  const [linkedFromPage, setLinkedFromPage] = createSignal(false);
  const [offscreen, setOffscreen] = createSignal<ReadonlySet<string>>(new Set());

  const fromTarget = (sender: Sender) => {
    const target = deps.targetTabId();
    return target !== null && sender.tab?.id === target;
  };

  const highlight = (id: string | null) => {
    setLinkedId(id);
    setLinkedFromPage(false);
    void deps.sendToTab('highlightAnnotation', { id });
  };

  const stopLinked = deps.onLinked(({ data, sender }) => {
    if (!fromTarget(sender)) return;
    setLinkedId(data.id);
    setLinkedFromPage(data.id !== null);
  });
  const stopOffscreen = deps.onOffscreen(({ data, sender }) => {
    if (!fromTarget(sender)) return;
    setOffscreen(new Set(data.offscreen));
  });

  return {
    enter: (id) => highlight(id),
    leave: () => highlight(null),
    linkedId,
    linkedFromPage,
    offscreen,
    requestVisibility() {
      void deps.sendToTab('reportVisibility', undefined);
    },
    dispose() {
      stopLinked();
      stopOffscreen();
    },
  };
}
