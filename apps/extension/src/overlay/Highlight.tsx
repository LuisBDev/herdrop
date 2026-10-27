import { Hand } from 'lucide-solid';
import { createEffect, createSignal, Show } from 'solid-js';
import { useOverlay } from './overlay-state.ts';
import { boxRect, labelPosition } from './selection.ts';
import type { HoverTarget } from './use-hover-target.ts';

export function Highlight(props: { hover: HoverTarget }) {
  const state = useOverlay();
  const [labelWidth, setLabelWidth] = createSignal(0);
  let label: HTMLDivElement | undefined;
  const grab = () => state.mode() === 'grab';

  createEffect(() => {
    props.hover.hovered();
    grab();
    if (label) setLabelWidth(label.offsetWidth);
  });

  return (
    <Show when={props.hover.hovered()}>
      {(hovered) => {
        const box = () => boxRect(hovered().rect);
        const pos = () => labelPosition(hovered().rect, labelWidth(), { width: window.innerWidth });
        return (
          <>
            <div
              class="ov-box"
              classList={{ grab: grab() }}
              aria-hidden="true"
              style={{
                left: `${box().left}px`,
                top: `${box().top}px`,
                width: `${box().width}px`,
                height: `${box().height}px`,
              }}
            />
            <div
              ref={label}
              class="ov-label"
              aria-hidden="true"
              style={{ left: `${pos().left}px`, top: `${pos().top}px` }}
            >
              <Show when={grab()}>
                <span class="mode">
                  <Hand size={14} aria-hidden="true" />
                  Grab
                </span>
              </Show>
              <span class="tag">{hovered().tag}</span>
              <Show when={hovered().component}>
                {(component) => <span class="cmp">{component()}</span>}
              </Show>
            </div>
          </>
        );
      }}
    </Show>
  );
}
