import { CircleX, Copy, RotateCcw, TriangleAlert } from 'lucide-solid';
import { For, Show } from 'solid-js';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import type { ActionId, FailureView } from './deliver-view.ts';

export function FailureAlert(props: { view: FailureView; onAction: (id: ActionId) => void }) {
  const others = () => props.view.others.filter((a) => a.id !== 'discard');
  const discard = () => props.view.others.find((a) => a.id === 'discard');

  return (
    <div
      role="alert"
      class={cn(
        'grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 rounded-lg border p-3',
        props.view.variant === 'err'
          ? 'border-semantic-danger-border bg-semantic-danger-soft'
          : 'border-semantic-warning-border bg-semantic-warning-soft',
      )}
    >
      <Show
        when={props.view.variant === 'err'}
        fallback={<TriangleAlert size={20} class="text-semantic-warning" aria-hidden="true" />}
      >
        <CircleX size={20} class="text-semantic-danger" aria-hidden="true" />
      </Show>
      <div>
        <p class="m-0 text-sm font-semibold leading-[1.35]">{props.view.title}</p>
        <p class="m-0 mt-0.5 text-[13px] [text-wrap:pretty]">{props.view.body}</p>
        <div class="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => props.onAction(props.view.primary.id)}>
            <Show when={props.view.primary.id === 'retry'}>
              <RotateCcw size={16} aria-hidden="true" />
            </Show>
            <Show when={props.view.primary.id === 'copy'}>
              <Copy size={16} aria-hidden="true" />
            </Show>
            {props.view.primary.label}
          </Button>
          <For each={others()}>
            {(action) => (
              <Button size="sm" variant="outline" onClick={() => props.onAction(action.id)}>
                {action.label}
              </Button>
            )}
          </For>
          <Show when={discard()}>
            {(action) => (
              <Button size="sm" variant="danger" onClick={() => props.onAction(action().id)}>
                {action().label}
              </Button>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}
