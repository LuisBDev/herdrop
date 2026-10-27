import { Maximize2 } from 'lucide-solid';
import { onMount, Show } from 'solid-js';
import type { Intent } from '../draft/model.ts';
import { type PillState, pillText } from './note-state.ts';
import type { Position } from './placement.ts';

export type NotePillProps = {
  number: number;
  intent: Intent;
  state: PillState;
  pos: Position;
  linked: boolean;
  onRestore(): void;
  onHover(on: boolean): void;
  measureRef?: (el: HTMLButtonElement) => void;
};

export function NotePill(props: NotePillProps) {
  let button: HTMLButtonElement | undefined;
  const text = () => pillText(props.state);
  const label = () => {
    const base = `Restore annotation ${props.number}, ${props.intent}`;
    return text() === '' ? base : `${base}, ${text().toLowerCase()}`;
  };

  onMount(() => {
    if (!button) return;
    props.measureRef?.(button);
    button.focus({ preventScroll: true });
  });

  return (
    <button
      ref={button}
      type="button"
      class="note-pill"
      classList={{ linked: props.linked }}
      aria-label={label()}
      style={{ left: `${props.pos.left}px`, top: `${props.pos.top}px` }}
      onClick={() => props.onRestore()}
      onMouseEnter={() => props.onHover(true)}
      onFocus={() => props.onHover(true)}
      onMouseLeave={() => props.onHover(false)}
      onBlur={() => props.onHover(false)}
    >
      <span class="num">{props.number}</span>
      <span>{props.intent}</span>
      <Show when={text() !== ''}>
        <span class="unsaved">
          <span class="dot" />
          {text()}
        </span>
      </Show>
      <span class="restore">
        <Maximize2 size={14} aria-hidden="true" />
      </span>
    </button>
  );
}
