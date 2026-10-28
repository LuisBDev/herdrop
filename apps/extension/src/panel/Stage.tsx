import { Check } from 'lucide-solid';
import { type JSX, Show } from 'solid-js';
import type { StageMark } from './stage-marks.ts';
import { InfoTip } from './ui/info-tip';
import { cn } from './ui/utils';

const MARK_CLASS: Record<StageMark['mark'], string> = {
  todo: 'border-control-border bg-canvas text-ink-subtle',
  cur: 'border-ink bg-ink text-canvas',
  done: 'border-semantic-success bg-semantic-success-soft text-semantic-success',
  fail: 'border-semantic-warning bg-semantic-warning-soft text-semantic-warning',
};

export function Stage(props: {
  number: 1 | 2 | 3;
  title: string;
  info: { label: string; text: string };
  marks: StageMark;
  grow?: boolean;
  meta?: string;
  right?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <li
      aria-current={props.marks.current ? 'step' : undefined}
      class={cn(
        'relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 py-3',
        props.grow && 'min-h-0 flex-1 grid-rows-[minmax(0,1fr)]',
      )}
    >
      <Show when={props.number !== 3}>
        <span
          aria-hidden="true"
          class={cn(
            'absolute -bottom-2 left-[11px] top-[42px] w-0.5',
            props.marks.mark === 'done' ? 'bg-semantic-success-border' : 'bg-hairline',
          )}
        />
      </Show>
      <span
        class={cn(
          'flex size-6 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums',
          MARK_CLASS[props.marks.mark],
        )}
      >
        {props.marks.mark === 'done' ? (
          <>
            <Check size={14} stroke-width={3} aria-hidden="true" />
            <span class="sr-only">Done:</span>
          </>
        ) : props.marks.mark === 'fail' ? (
          <>
            <span aria-hidden="true" class="inline-flex size-3.5 items-center justify-center">
              !
            </span>
            <span class="sr-only">Needs attention:</span>
          </>
        ) : (
          props.number
        )}
      </span>
      <div class="flex min-h-0 min-w-0 flex-col gap-2.5">
        <div class="flex items-center gap-1.5">
          <h2
            class={cn(
              'text-sm font-semibold leading-[1.3] tracking-[-0.1px]',
              props.marks.muted && 'font-medium text-ink-subtle',
            )}
          >
            {props.title}
          </h2>
          <Show when={props.meta}>
            <span class="text-xs text-ink-subtle">{props.meta}</span>
          </Show>
          <InfoTip label={props.info.label} text={props.info.text} />
          <Show when={props.right}>
            <div class="ml-auto flex items-center gap-1">{props.right}</div>
          </Show>
        </div>
        {props.children}
      </div>
    </li>
  );
}
