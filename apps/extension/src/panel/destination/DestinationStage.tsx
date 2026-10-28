import { createSignal, onCleanup, Show } from 'solid-js';
import { bridgeBase, createBridgeClient } from '../../bridge/client.ts';
import { Stage } from '../Stage.tsx';
import { stageMarks } from '../stage-marks.ts';
import { usePanel } from '../state.ts';
import { Button } from '../ui/button';
import { DestinationPicker } from './DestinationPicker.tsx';
import { DestinationSummary } from './DestinationSummary.tsx';
import { createAgents } from './use-agents.ts';

const NOTE_MS = 6000;

function PickerMount() {
  const agents = createAgents({ client: createBridgeClient(fetch.bind(globalThis), bridgeBase) });
  onCleanup(() => agents.dispose());
  void agents.reload();
  return <DestinationPicker agents={agents} />;
}

export function DestinationStage() {
  const panel = usePanel();
  const [changeNote, setChangeNote] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  async function change() {
    if (panel.draft().phase === 'sending') return;
    const result = await panel.dispatch({ type: 'destination.clear' });
    if (result.ok) {
      clearTimeout(timer);
      setChangeNote(false);
      return;
    }
    if (result.reason !== 'draft_not_empty' && result.reason !== 'wrong_phase') return;
    setChangeNote(true);
    clearTimeout(timer);
    timer = setTimeout(() => setChangeNote(false), NOTE_MS);
  }

  const destination = () => {
    const draft = panel.draft();
    return draft.phase === 'no_destination' ? null : draft.destination;
  };

  return (
    <Stage
      number={1}
      title="Destination"
      info={{
        label: 'About destination',
        text: 'Every annotation in a draft goes to this agent. The pane focused in Herdr comes preselected. You can change it while the draft is empty.',
      }}
      marks={stageMarks(panel.draft()).destination}
      grow={stageMarks(panel.draft()).destination.grow}
      right={
        <Show when={destination()}>
          <Button
            variant="ghost"
            size="sm"
            aria-disabled={panel.draft().phase === 'sending'}
            onClick={() => void change()}
          >
            Change
          </Button>
        </Show>
      }
    >
      <Show when={destination()} fallback={<PickerMount />}>
        {(dest) => (
          <DestinationSummary
            destination={dest()}
            drafting={panel.draft().phase === 'drafting'}
            changeNote={changeNote()}
          />
        )}
      </Show>
    </Stage>
  );
}
