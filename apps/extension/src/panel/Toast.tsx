import { Check } from 'lucide-solid';
import { Show } from 'solid-js';
import { usePanel } from './state.ts';

export function Toast() {
  const { feedback } = usePanel();
  return (
    <Show when={feedback.toast()}>
      {(text) => (
        <div
          aria-hidden="true"
          class="pointer-events-none absolute left-4 right-4 top-16 z-40 flex gap-2.5 rounded-md bg-ink px-3.5 py-2.5 text-[13px] leading-[1.35] text-canvas shadow-float"
        >
          <Check size={16} class="shrink-0 text-[#27a644] dark:text-[#1e7a34]" />
          <span>{text()}</span>
        </div>
      )}
    </Show>
  );
}
