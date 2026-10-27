import { CircleAlert, CircleX } from 'lucide-solid';
import { For, Match, Show, Switch } from 'solid-js';
import { usePanel } from '../state.ts';
import { Button } from '../ui/button';
import { toDestination } from './agents-view.ts';
import { MachineGroup } from './MachineGroup.tsx';
import type { createAgents } from './use-agents.ts';

export function DestinationPicker(props: { agents: ReturnType<typeof createAgents> }) {
  const panel = usePanel();
  const picked = () => {
    const pick = props.agents.pick();
    if (pick === null) return null;
    for (const group of props.agents.groups()) {
      if (group.machine.key !== pick.machineKey) continue;
      const agent = group.resp?.agents.find((a) => a.pane_id === pick.paneId);
      if (agent) return { machine: group.machine, agent };
    }
    return null;
  };

  async function confirm() {
    const target = picked();
    if (target === null) return;
    const result = await panel.dispatch({
      type: 'destination.pick',
      destination: toDestination(target.machine, target.agent),
    });
    if (result.ok) panel.feedback.announce('Destination set');
  }

  return (
    <Switch>
      <Match when={props.agents.bridge() === 'unreachable'}>
        <div class="flex items-center justify-between gap-2 rounded-md border border-semantic-danger-border bg-semantic-danger-soft py-2 pr-2 pl-3 text-[13px]">
          <span class="flex items-center gap-2">
            <CircleX size={16} class="text-semantic-danger" aria-hidden="true" />
            Can't reach the Herdrop bridge
          </span>
          <Button size="sm" onClick={() => void props.agents.reload()}>
            Retry
          </Button>
        </div>
      </Match>
      <Match when={props.agents.bridge() === 'ready'}>
        <div class="-mr-4 -ml-0.5 flex min-h-0 flex-1 flex-col gap-3 overflow-auto py-0.5 pr-4 pb-2 pl-0.5">
          <fieldset class="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0">
            <legend class="sr-only">Destination agent</legend>
            <For each={props.agents.groups()}>
              {(group) => (
                <MachineGroup
                  group={group}
                  machinesError={props.agents.machinesError()}
                  now={props.agents.now()}
                  pick={props.agents.pick()}
                  onChoose={props.agents.choose}
                  onRefresh={() => void props.agents.refresh(group.machine.key)}
                />
              )}
            </For>
          </fieldset>
        </div>
        <Show when={picked()?.agent.status === 'blocked'}>
          <div
            role="status"
            class="flex gap-2 rounded-md border border-semantic-warning-border bg-semantic-warning-soft px-2.5 py-2 text-[13px]"
          >
            <CircleAlert
              size={16}
              class="mt-0.5 shrink-0 text-semantic-warning"
              aria-hidden="true"
            />
            Blocked in Herdr. Answer it before you send.
          </div>
        </Show>
        <Button
          size="lg"
          variant={panel.siteAccess() === 'granted' ? 'primary' : 'outline'}
          aria-disabled={picked() === null}
          onClick={() => void confirm()}
        >
          Use this agent
        </Button>
      </Match>
    </Switch>
  );
}
