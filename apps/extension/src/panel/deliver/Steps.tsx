import { Circle, CircleAlert, CircleCheck, CircleX, LoaderCircle } from 'lucide-solid';
import { For, Match, Show, Switch } from 'solid-js';
import { cn } from '../ui/utils';
import type { StepRow } from './deliver-view.ts';

export function Steps(props: { rows: StepRow[]; sending: boolean }) {
  return (
    <ol
      aria-label="Delivery steps"
      aria-busy={props.sending}
      class="m-0 flex list-none flex-col p-0"
    >
      <For each={props.rows}>
        {(row) => (
          <li
            aria-current={row.state === 'run' ? 'step' : undefined}
            class="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 py-1"
          >
            <Switch>
              <Match when={row.state === 'done'}>
                <CircleCheck size={18} class="mt-px text-semantic-success" aria-hidden="true" />
              </Match>
              <Match when={row.state === 'run'}>
                <LoaderCircle
                  size={18}
                  class="mt-px animate-spin text-status-working"
                  aria-hidden="true"
                />
              </Match>
              <Match when={row.state === 'todo'}>
                <Circle size={18} class="mt-px text-control-border" aria-hidden="true" />
              </Match>
              <Match when={row.state === 'fail'}>
                <CircleX size={18} class="mt-px text-semantic-danger" aria-hidden="true" />
              </Match>
              <Match when={row.state === 'warn'}>
                <CircleAlert size={18} class="mt-px text-semantic-warning" aria-hidden="true" />
              </Match>
            </Switch>
            <div>
              <p
                class={cn(
                  'm-0 text-[13px] font-medium leading-[1.35]',
                  row.state === 'todo' && 'font-normal text-ink-subtle',
                )}
              >
                {row.label}
              </p>
              <Show when={row.detail}>
                <p class="m-0 text-xs text-ink-subtle [overflow-wrap:anywhere]">{row.detail}</p>
              </Show>
            </div>
          </li>
        )}
      </For>
    </ol>
  );
}
