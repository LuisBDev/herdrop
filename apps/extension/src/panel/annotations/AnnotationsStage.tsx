import { Globe, MousePointer2 } from 'lucide-solid';
import { createEffect, createSignal, createUniqueId, For, on, onCleanup, Show } from 'solid-js';
import { panelMessenger } from '../../messaging/panel.ts';
import { Stage } from '../Stage';
import { stageMarks } from '../stage-marks.ts';
import { usePanel } from '../state.ts';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { AnnotationItem } from './AnnotationItem.tsx';
import { annotationsView } from './annotations-view.ts';
import { createHoverSync } from './hover-sync.ts';
import { UndoRow } from './UndoRow.tsx';

export function AnnotationsStage() {
  const panel = usePanel();
  const listId = createUniqueId();
  const [shown, setShown] = createSignal(false);

  const sync = createHoverSync({
    sendToTab: panel.sendToTab,
    targetTabId: () => panel.targetTab()?.id ?? null,
    onLinked: (handler) => panelMessenger.onMessage('annotationLinked', handler),
    onOffscreen: (handler) => panelMessenger.onMessage('visibilityChanged', handler),
  });
  onCleanup(sync.dispose);

  createEffect(
    on(
      () => panel.targetTab()?.id,
      () => sync.requestVisibility(),
    ),
  );

  const draft = () => panel.draft();
  const locked = () => draft().phase === 'sending' || draft().phase === 'failed';
  const view = () => annotationsView(draft(), panel.targetTab()?.url ?? null, sync.offscreen());
  const marks = () => stageMarks(draft()).annotations;
  const hasDestination = () => draft().phase !== 'no_destination';
  const showList = () => hasDestination() && (!locked() || shown());
  const showEmpty = () =>
    draft().phase === 'drafting' &&
    draft().annotations.length === 0 &&
    panel.siteAccess() === 'granted' &&
    !panel.ui().selectOn &&
    !panel.grabArmed();

  const discard = async () => {
    const result = await panel.dispatch({ type: 'draft.discard' });
    if (result.ok) panel.feedback.announce('Draft discarded');
  };

  const remove = async (id: string) => {
    const number = draft().annotations.findIndex((a) => a.id === id) + 1;
    const result = await panel.dispatch({ type: 'annotation.delete', id });
    if (!result.ok) return;
    await panel.sendToTab('closeEditor', { annotationId: id });
    panel.feedback.announce(`Annotation ${number} deleted`);
  };

  return (
    <Stage
      number={2}
      title="Annotations"
      meta={view().count}
      info={{
        label: 'About annotations',
        text: 'Click elements on the page to annotate them. Arrow up and down move to the parent or child. Each annotation keeps its number on the page and here.',
      }}
      marks={marks()}
      grow={marks().grow || (locked() && shown())}
      right={
        <>
          <Show when={draft().phase === 'drafting' && draft().annotations.length > 0}>
            <Button variant="danger" size="sm" onClick={() => void discard()}>
              Discard
            </Button>
          </Show>
          <Show when={locked()}>
            <Tooltip content="Locked while the drop runs">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={shown()}
                aria-controls={listId}
                onClick={() => setShown((value) => !value)}
              >
                {shown() ? 'Hide' : 'Show'}
              </Button>
            </Tooltip>
          </Show>
        </>
      }
    >
      <div
        id={listId}
        hidden={!showList()}
        class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto"
      >
        <Show when={showList()}>
          <UndoRow />
          <Show when={showEmpty()}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void panel.sendBackground('setSelect', { on: true })}
            >
              <MousePointer2 size={16} aria-hidden="true" />
              Select elements
            </Button>
          </Show>
          <For each={view().groups}>
            {(group) => (
              <div>
                <p class="mb-1 ml-2 flex items-center gap-1.5 font-mono text-xs text-ink-subtle">
                  <Globe size={14} aria-hidden="true" />
                  {group.page}
                </p>
                <ol aria-label={group.label} class="m-0 flex list-none flex-col p-0">
                  <For each={group.items}>
                    {(item) => (
                      <AnnotationItem
                        item={item}
                        locked={locked()}
                        linked={item.id === sync.linkedId()}
                        scrollWhenLinked={sync.linkedFromPage()}
                        sync={sync}
                        onDelete={(id) => void remove(id)}
                      />
                    )}
                  </For>
                </ol>
              </div>
            )}
          </For>
        </Show>
      </div>
    </Stage>
  );
}
