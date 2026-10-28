import { Copy, Send } from 'lucide-solid';
import { createEffect, createSignal, on, onCleanup, onMount, Show } from 'solid-js';
import { createBridgeClient } from '../../bridge/client.ts';
import { bridgeBase } from '../../bridge/settings.ts';
import { copyText } from '../../lib/clipboard.ts';
import { backgroundMessenger } from '../../messaging/background.ts';
import { renderBundle } from '../../render/bundle.ts';
import { renderClipboard } from '../../render/clipboard.ts';
import { draftItem } from '../../storage/items.ts';
import { Stage } from '../Stage.tsx';
import { stageMarks } from '../stage-marks.ts';
import { usePanel } from '../state.ts';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { DeliveredAlert } from './DeliveredAlert.tsx';
import { createDeliverController } from './deliver-controller.ts';
import {
  type ActionId,
  deliverAnnouncement,
  deliveredView,
  elapsedText,
  failureView,
  sendView,
  stepsView,
} from './deliver-view.ts';
import { FailureAlert } from './FailureAlert.tsx';
import { Steps } from './Steps.tsx';

const INFO = {
  label: 'About delivery',
  text: 'Send writes the draft next to the agent and prompts it. Remote drops can take 15 to 20 s. Copy all puts the draft on the clipboard as Markdown and keeps it.',
};

export function DeliverStage() {
  const panel = usePanel();
  const { draft, ui, feedback } = panel;
  const controller = createDeliverController({
    draft,
    delivery: {
      client: createBridgeClient(fetch.bind(globalThis), bridgeBase),
      readDraft: () => draftItem.getValue(),
      dispatch: (e) => backgroundMessenger.sendMessage('dispatch', e),
      render: renderBundle,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      newRequestId: () => crypto.randomUUID(),
    },
  });
  const [dismissed, setDismissed] = createSignal<string | null>(null);
  const [nowMs, setNowMs] = createSignal(Date.now());

  onMount(() => void controller.resumeOnLoad());

  createEffect(
    on(
      draft,
      (next, prev) => {
        if (prev === undefined) return;
        const text = deliverAnnouncement(prev, next);
        if (text !== null) feedback.announce(text);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    if (controller.startedAt() === null) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    onCleanup(() => clearInterval(id));
  });

  const annotations = () => draft().annotations;
  const view = () => sendView({ count: annotations().length, pending: ui().pending !== null });
  const busy = () => {
    const d = draft();
    return d.phase === 'sending' || d.phase === 'failed' ? d : null;
  };
  const failed = () => {
    const d = draft();
    return d.phase === 'failed' ? d : null;
  };
  const elapsed = () => {
    const d = draft();
    const started = controller.startedAt();
    if (d.phase !== 'sending' || started === null) return '';
    const seconds = Math.max(0, Math.floor((nowMs() - started) / 1000));
    return elapsedText(seconds, !d.destination.local);
  };
  const delivered = () => {
    const d = draft();
    if (d.phase !== 'drafting' || d.lastDelivery === null) return null;
    return d.lastDelivery.dropId === dismissed() ? null : d.lastDelivery;
  };

  async function copyAll() {
    const list = annotations();
    if (list.length === 0) return;
    const ok = await copyText(renderClipboard(list));
    if (!ok) {
      feedback.showToast('Copy failed. Click the panel and try again.');
      return;
    }
    const n = list.length;
    feedback.showToast(`Copied ${n} ${n === 1 ? 'annotation' : 'annotations'}`);
    feedback.announce(`Copied ${n} annotations as Markdown`);
  }

  function onAction(id: ActionId) {
    if (id === 'retry') void controller.retry();
    else if (id === 'move') void controller.move();
    else if (id === 'copy') void copyAll();
    else void controller.discard();
  }

  function send() {
    if (view().unavailable) return;
    void controller.send();
  }

  const sendButton = () => (
    <Button
      size="lg"
      variant="primary"
      class="w-full grow"
      aria-disabled={view().unavailable}
      onClick={send}
    >
      <Send size={16} aria-hidden="true" />
      {view().label}
    </Button>
  );

  return (
    <Stage
      number={3}
      title="Deliver"
      info={INFO}
      marks={stageMarks(draft()).deliver}
      right={
        <Show when={draft().phase === 'sending'}>
          <span aria-hidden="true" class="text-[13px] tabular-nums text-ink-subtle">
            {elapsed()}
          </span>
        </Show>
      }
    >
      <Show when={draft().phase === 'drafting'}>
        <Show when={delivered()}>
          {(last) => (
            <DeliveredAlert
              view={deliveredView(last())}
              onDismiss={() => setDismissed(last().dropId)}
            />
          )}
        </Show>
        <div class="flex gap-2">
          <Button
            size="lg"
            variant="outline"
            aria-disabled={view().copyUnavailable}
            onClick={() => void copyAll()}
          >
            <Copy size={16} aria-hidden="true" />
            Copy all
          </Button>
          <div class="flex grow [&>span]:grow">
            <Show when={view().tip} fallback={sendButton()}>
              {(tip) => <Tooltip content={tip()}>{sendButton()}</Tooltip>}
            </Show>
          </div>
        </div>
      </Show>
      <Show when={busy()}>
        {(d) => (
          <>
            <Show when={failed()}>
              {(f) => <FailureAlert view={failureView(f())} onAction={onAction} />}
            </Show>
            <Steps rows={stepsView(d())} sending={d().phase === 'sending'} />
            <Show when={d().dropId}>
              {(id) => <p class="m-0 font-mono text-xs text-ink-subtle">{id()}</p>}
            </Show>
          </>
        )}
      </Show>
    </Stage>
  );
}
