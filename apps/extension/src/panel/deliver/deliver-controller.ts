import { type Accessor, createSignal } from 'solid-js';
import { type DeliveryDeps, retryDraft, runDelivery, sendDraft } from '../../bridge/delivery.ts';
import type { Draft } from '../../draft/model.ts';

export type DeliverDriver = {
  sendDraft: (deps: DeliveryDeps) => Promise<void>;
  retryDraft: (deps: DeliveryDeps) => Promise<void>;
  runDelivery: (deps: DeliveryDeps, mode: 'new' | 'retry' | 'resume') => Promise<void>;
};

export type DeliverController = {
  send(): Promise<void>;
  retry(): Promise<void>;
  move(): Promise<void>;
  discard(): Promise<void>;
  resumeOnLoad(): Promise<void>;
  startedAt: Accessor<number | null>;
};

const defaultDriver: DeliverDriver = { sendDraft, retryDraft, runDelivery };

export function createDeliverController(deps: {
  delivery: DeliveryDeps;
  draft: Accessor<Draft>;
  driver?: DeliverDriver;
  now?: () => number;
}): DeliverController {
  const { delivery, draft } = deps;
  const driver = deps.driver ?? defaultDriver;
  const now = deps.now ?? Date.now;
  const [startedAt, setStartedAt] = createSignal<number | null>(null);
  let running = false;

  async function exclusive(call: () => Promise<void>): Promise<void> {
    if (running) return;
    running = true;
    setStartedAt(now());
    try {
      await call();
    } finally {
      running = false;
      setStartedAt(null);
    }
  }

  return {
    send: () => exclusive(() => driver.sendDraft(delivery)),
    retry: () => exclusive(() => driver.retryDraft(delivery)),
    move: async () => {
      await delivery.dispatch({ type: 'send.moveToAnotherAgent' });
    },
    discard: async () => {
      await delivery.dispatch({ type: 'draft.discard' });
    },
    resumeOnLoad: async () => {
      if (draft().phase !== 'sending') return;
      await exclusive(() => driver.runDelivery(delivery, 'resume'));
    },
    startedAt,
  };
}
