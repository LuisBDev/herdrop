import { CircleX, Monitor, RefreshCw, Server } from 'lucide-solid';
import { For, Show } from 'solid-js';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { cn } from '../ui/utils';
import { AgentRow } from './AgentRow.tsx';
import { machineError, machineName, metaText, type Pick } from './agents-view.ts';
import type { AgentGroup } from './use-agents.ts';

export function MachineGroup(props: {
  group: AgentGroup;
  machinesError: string | null;
  now: number;
  pick: Pick | null;
  onChoose(p: Pick): void;
  onRefresh(): void;
}) {
  const machine = () => props.group.machine;
  const error = () => machineError(machine(), props.machinesError, props.group.resp);
  const agents = () => props.group.resp?.agents ?? [];
  const refreshLabel = () => `Refresh agents on ${machine().label}`;
  return (
    <div>
      <div class="mb-1.5 flex min-h-8 items-center gap-2">
        <Show when={machine().local} fallback={<Server size={16} aria-hidden="true" />}>
          <Monitor size={16} aria-hidden="true" />
        </Show>
        <h3 class="text-[13px] font-semibold">{machineName(machine())}</h3>
        <span class="ml-auto text-xs text-ink-subtle" aria-live="polite">
          {metaText(props.group.resp, machine().local, props.now)}
        </span>
        <Show when={!machine().local && error() === null}>
          <Tooltip content={refreshLabel()}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={refreshLabel()}
              onClick={props.onRefresh}
            >
              <RefreshCw
                size={16}
                aria-hidden="true"
                class={cn(props.group.polling && 'animate-spin')}
              />
            </Button>
          </Tooltip>
        </Show>
      </div>
      <Show when={error()}>
        {(text) => (
          <div
            role="alert"
            class="flex items-center justify-between gap-2 rounded-md border border-semantic-danger-border bg-semantic-danger-soft py-2 pr-2 pl-3 text-[13px]"
          >
            <span class="flex items-center gap-2">
              <CircleX size={16} class="text-semantic-danger" aria-hidden="true" />
              {text()}
            </span>
            <Button size="sm" onClick={props.onRefresh}>
              Retry
            </Button>
          </div>
        )}
      </Show>
      <Show when={error() === null && !props.group.polling && agents().length === 0}>
        <p class="rounded-md border border-dashed border-hairline px-3 py-2.5 text-[13px] text-ink-subtle">
          No agents running
        </p>
      </Show>
      <Show when={agents().length > 0}>
        <ul class="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1">
          <For each={agents()}>
            {(agent) => (
              <li>
                <AgentRow
                  agent={agent}
                  checked={
                    props.pick?.machineKey === machine().key && props.pick.paneId === agent.pane_id
                  }
                  onChoose={() =>
                    props.onChoose({ machineKey: machine().key, paneId: agent.pane_id })
                  }
                />
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
