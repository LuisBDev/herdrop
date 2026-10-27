import {
  Activity,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleQuestionMark,
  Info,
  Monitor,
  Server,
} from 'lucide-solid';
import { type Component, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { Destination } from '../../draft/model.ts';
import { cn } from '../ui/utils';
import { kindLabel, type StatusIcon, statusView } from './agents-view.ts';

const ICONS: Record<StatusIcon, Component<{ size?: number; 'aria-hidden'?: 'true' }>> = {
  CircleDot,
  Activity,
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
};

function InlineNote(props: { icon: 'alert' | 'info'; text: string }) {
  return (
    <div
      role="status"
      class="flex gap-2 rounded-md border border-semantic-warning-border bg-semantic-warning-soft px-2.5 py-2 text-[13px]"
    >
      <Dynamic
        component={props.icon === 'alert' ? CircleAlert : Info}
        size={16}
        class="mt-0.5 shrink-0 text-semantic-warning"
        aria-hidden="true"
      />
      <span>{props.text}</span>
    </div>
  );
}

export function DestinationSummary(props: {
  destination: Destination;
  drafting: boolean;
  changeNote: boolean;
}) {
  const status = () => statusView(props.destination.status);
  return (
    <>
      <div class="flex flex-col gap-[3px]">
        <span class="font-medium">{props.destination.name}</span>
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-subtle">
          <span class="inline-flex items-center gap-1 text-ink">
            <Dynamic
              component={props.destination.local ? Monitor : Server}
              size={14}
              aria-hidden="true"
            />
            {props.destination.machineLabel}
          </span>
          <span class="font-mono">{kindLabel(props.destination.kind)}</span>
          <span class="font-mono">{props.destination.paneId}</span>
          <span
            class={cn('inline-flex items-center gap-1 whitespace-nowrap font-medium', status().cls)}
          >
            <Dynamic component={ICONS[status().icon]} size={14} aria-hidden="true" />
            {status().text}
          </span>
        </div>
        <span class="break-all font-mono text-xs leading-[1.4] text-ink-subtle">
          {props.destination.folder}
        </span>
      </div>
      <Show when={props.destination.status === 'blocked' && props.drafting}>
        <InlineNote icon="alert" text="Blocked in Herdr. Answer it before you send." />
      </Show>
      <Show when={props.changeNote}>
        <InlineNote icon="info" text="Send or discard the draft first." />
      </Show>
    </>
  );
}
