import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import { usePanel } from '../state.ts';
import { Button } from '../ui/button';
import { undoView } from './annotations-view.ts';

const UNDO_MS = 8000;

export function UndoRow() {
  const panel = usePanel();
  const [visible, setVisible] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let row: HTMLDivElement | undefined;

  const view = () => undoView(panel.draft());

  onCleanup(() => clearTimeout(timer));

  createEffect(
    on(
      () => view()?.id,
      (id) => {
        clearTimeout(timer);
        if (id === undefined) {
          setVisible(false);
          return;
        }
        setVisible(true);
        row?.focus({ preventScroll: true });
        timer = setTimeout(() => setVisible(false), UNDO_MS);
      },
    ),
  );

  const undo = async () => {
    clearTimeout(timer);
    setVisible(false);
    const result = await panel.dispatch({ type: 'annotation.undoDelete' });
    if (result.ok) panel.feedback.announce('Restored');
  };

  return (
    <Show when={visible() && view()}>
      {(current) => (
        <div
          ref={row}
          role="status"
          tabindex="-1"
          class="flex items-center justify-between gap-2 rounded-md border border-hairline bg-surface-2 py-1.5 pr-1.5 pl-3 text-[13px]"
        >
          <span>{current().text}</span>
          <Button variant="ghost" size="sm" onClick={() => void undo()}>
            Undo
          </Button>
        </div>
      )}
    </Show>
  );
}
