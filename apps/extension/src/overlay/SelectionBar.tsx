import { ArrowDown, ArrowUp, Hand, MousePointer2 } from 'lucide-solid';
import { Show } from 'solid-js';
import { useOverlay } from './overlay-state.ts';
import type { HoverTarget } from './use-hover-target.ts';

export function SelectionBar(props: { hover: HoverTarget }) {
  const state = useOverlay();
  const grab = () => state.mode() === 'grab';
  const lead = () => (grab() ? 'Grab an element' : 'Annotate an element');

  return (
    <Show when={state.mode() !== 'off'}>
      <section class="sel-hint" aria-label={lead()}>
        <span class="lead">
          <Show when={grab()} fallback={<MousePointer2 size={16} aria-hidden="true" />}>
            <Hand size={16} aria-hidden="true" />
          </Show>
          {lead()}
        </span>
        <button type="button" class="pill-btn" onClick={() => props.hover.up()}>
          <ArrowUp size={14} aria-hidden="true" />
          Parent
        </button>
        <button type="button" class="pill-btn" onClick={() => props.hover.down()}>
          <ArrowDown size={14} aria-hidden="true" />
          Child
        </button>
        <button type="button" class="pill-btn" onClick={() => props.hover.stop()}>
          Stop
          <span class="k">Esc</span>
        </button>
      </section>
    </Show>
  );
}
