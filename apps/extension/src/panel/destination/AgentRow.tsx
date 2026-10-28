import type { AgentView } from '@herdrop/protocol';
import { Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { Badge } from '../ui/badge';
import { cn } from '../ui/utils';
import { kindLabel, statusView } from './agents-view.ts';
import { STATUS_ICONS } from './status-icons.ts';

export function AgentRow(props: { agent: AgentView; checked: boolean; onChoose: () => void }) {
  const status = () => statusView(props.agent.status);
  return (
    <label
      class={cn(
        'grid cursor-pointer grid-cols-[18px_minmax(0,1fr)] gap-2.5 px-3 py-2.5 hover:bg-surface-2',
        props.checked && 'bg-surface-3',
      )}
    >
      <input
        type="radio"
        name="herdrop-dest"
        checked={props.checked}
        onChange={props.onChoose}
        class="mt-0.5 size-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
        style={{ 'accent-color': 'var(--ink)' }}
      />
      <span class="flex min-w-0 flex-col gap-1">
        <span class="flex items-start justify-between gap-2.5">
          <span class="font-medium leading-[1.35]">{props.agent.name}</span>
          <span class={cn('inline-flex items-center gap-1 text-xs font-medium', status().cls)}>
            <Dynamic component={STATUS_ICONS[status().icon]} size={14} aria-hidden="true" />
            {status().text}
          </span>
        </span>
        <span class="flex flex-wrap items-center gap-1.5">
          <Badge variant="mono">{kindLabel(props.agent.kind)}</Badge>
          <span class="font-mono text-xs text-ink-subtle">{props.agent.pane_id}</span>
          <Show when={props.agent.focused}>
            <Badge variant="focus">Focused</Badge>
          </Show>
        </span>
        <span class="break-all font-mono text-xs text-ink-subtle">{props.agent.folder}</span>
      </span>
    </label>
  );
}
