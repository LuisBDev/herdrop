import { Check } from 'lucide-solid';
import { type Accessor, createSignal, Show } from 'solid-js';

type ToastValue = { text: string; sub: string };

export function createPageToast(
  setTimer: (fn: () => void, ms: number) => unknown = setTimeout,
  clearTimer: (handle: never) => void = clearTimeout,
): { current: Accessor<ToastValue | null>; show(text: string, sub: string): void } {
  const [current, setCurrent] = createSignal<ToastValue | null>(null);
  let handle: unknown;
  return {
    current,
    show(text, sub) {
      if (handle !== undefined) clearTimer(handle as never);
      setCurrent({ text, sub });
      handle = setTimer(() => {
        handle = undefined;
        setCurrent(null);
      }, 3200);
    },
  };
}

export function PageToast(props: { toast: ReturnType<typeof createPageToast> }) {
  return (
    <Show when={props.toast.current()}>
      {(value) => (
        <div class="toast page-toast" aria-hidden="true">
          <Check size={16} />
          {value().text}
          <Show when={value().sub}>
            <span class="mono">{value().sub}</span>
          </Show>
        </div>
      )}
    </Show>
  );
}
