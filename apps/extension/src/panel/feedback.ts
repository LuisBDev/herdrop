import { type Accessor, createSignal } from 'solid-js';

const TOAST_MS = 3200;
const REPEAT_MS = 100;

type TimerId = ReturnType<typeof setTimeout>;

export type Feedback = {
  toast: Accessor<string | null>;
  showToast(text: string): void;
  live: Accessor<string>;
  announce(text: string): void;
};

export function createFeedback(
  setTimer: (run: () => void, ms: number) => TimerId = setTimeout,
  clearTimer: (id: TimerId) => void = clearTimeout,
): Feedback {
  const [toast, setToast] = createSignal<string | null>(null);
  const [live, setLive] = createSignal('');
  let toastTimer: TimerId | undefined;
  let liveTimer: TimerId | undefined;

  return {
    toast,
    showToast(text) {
      if (toastTimer !== undefined) clearTimer(toastTimer);
      setToast(text);
      toastTimer = setTimer(() => {
        toastTimer = undefined;
        setToast(null);
      }, TOAST_MS);
    },
    live,
    announce(text) {
      if (liveTimer !== undefined) clearTimer(liveTimer);
      liveTimer = undefined;
      if (live() !== text) {
        setLive(text);
        return;
      }
      setLive('');
      liveTimer = setTimer(() => {
        liveTimer = undefined;
        setLive(text);
      }, REPEAT_MS);
    },
  };
}
