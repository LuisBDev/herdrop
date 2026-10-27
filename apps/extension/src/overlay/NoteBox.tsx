import { CircleAlert, GripVertical, Minus, Plus, Trash, X } from 'lucide-solid';
import { createUniqueId, For, onMount, Show } from 'solid-js';
import type { Intent, Priority } from '../draft/model.ts';
import { counterText, type NoteDraft } from './note-state.ts';
import { clamp, type NudgeKey, nudge, type Position, type Size } from './placement.ts';
import { useDrag } from './use-drag.ts';

const INTENTS: { value: Intent; tip: string }[] = [
  { value: 'fix', tip: 'Something is broken. The agent fixes it.' },
  { value: 'change', tip: 'Make it different. The agent edits it.' },
  { value: 'question', tip: 'The agent answers without editing code.' },
  { value: 'approve', tip: 'This is right. The agent leaves it alone.' },
];

const PRIORITIES: Priority[] = ['blocking', 'important', 'suggestion'];

const NUDGE_KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export type NoteBoxProps = {
  note: NoteDraft;
  number: number;
  heading: { title: string; tag: string; detail: string };
  pos: Position;
  linked: boolean;
  onChange(patch: Partial<NoteDraft>): void;
  onMove(pos: Position): void;
  onSave(): void;
  onCancel(): void;
  onDelete(): void;
  onMinimize(): void;
  onHover(on: boolean): void;
};

export function NoteBox(props: NoteBoxProps) {
  const id = createUniqueId();
  const titleId = `hd-note-title-${id}`;
  const errorId = `hd-note-err-${id}`;
  const counterId = `hd-note-count-${id}`;
  const moveTipId = `hd-tt-move-${id}`;
  let root: HTMLDivElement | undefined;
  let textarea: HTMLTextAreaElement | undefined;

  const size = (): Size => {
    const rect = root?.getBoundingClientRect();
    return { w: rect?.width ?? 380, h: rect?.height ?? 300 };
  };
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  const drag = useDrag({ origin: () => props.pos, size, onMove: (p) => props.onMove(p) });

  onMount(() => textarea?.focus({ preventScroll: true }));

  const isEdit = () => props.note.mode === 'edit';
  const counter = () => counterText(props.note.comment);

  const onRootKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      props.onCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      props.onSave();
    }
  };

  const onGripKey = (e: KeyboardEvent) => {
    if (!NUDGE_KEYS.has(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    props.onMove(clamp(nudge(props.pos, e.key as NudgeKey, e.shiftKey), size(), viewport()));
  };

  return (
    <div
      ref={root}
      class="note"
      classList={{ dragging: drag.dragging(), linked: props.linked }}
      role="dialog"
      aria-labelledby={titleId}
      style={{ left: `${props.pos.left}px`, top: `${props.pos.top}px` }}
      onKeyDown={onRootKey}
      onMouseEnter={() => props.onHover(true)}
      onMouseLeave={() => props.onHover(false)}
    >
      <div class="nb-head" onPointerDown={drag.onPointerDown}>
        <div class="tt-wrap">
          <button
            class="btn btn-ghost btn-icon sm grip"
            type="button"
            data-grip="1"
            aria-label="Move note"
            aria-describedby={moveTipId}
            onKeyDown={onGripKey}
          >
            <GripVertical size={16} aria-hidden="true" />
          </button>
          <span class="tt left" role="tooltip" id={moveTipId}>
            Drag, or move with the arrow keys
          </span>
        </div>
        <span class="num">{props.number}</span>
        <div style={{ 'min-width': '0' }}>
          <p class="nb-cmp" id={titleId}>
            <span class="sr">{`${isEdit() ? 'Edit' : 'New'} annotation ${props.number} on `}</span>
            {props.heading.title}
          </p>
          <p class="nb-el">
            <code>{props.heading.tag}</code>
            <span>{props.heading.detail}</span>
          </p>
        </div>
        <div class="nb-acts">
          <Show when={isEdit()}>
            <div class="tt-wrap">
              <button
                class="btn btn-ghost btn-icon sm nb-del"
                type="button"
                aria-label={`Delete annotation ${props.number}`}
                onClick={() => props.onDelete()}
              >
                <Trash size={16} aria-hidden="true" />
              </button>
              <span class="tt" role="tooltip">
                Delete annotation
              </span>
            </div>
            <span class="nb-sep" aria-hidden="true" />
          </Show>
          <div class="tt-wrap">
            <button
              class="btn btn-ghost btn-icon sm"
              type="button"
              aria-label="Minimize note"
              onClick={() => props.onMinimize()}
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <span class="tt" role="tooltip">
              Minimize
            </span>
          </div>
          <div class="tt-wrap">
            <button
              class="btn btn-ghost btn-icon sm"
              type="button"
              aria-label={isEdit() ? 'Close note' : 'Cancel annotation'}
              onClick={() => props.onCancel()}
            >
              <X size={16} aria-hidden="true" />
            </button>
            <span class="tt" role="tooltip">
              {isEdit() ? 'Close (Esc)' : 'Cancel (Esc)'}
            </span>
          </div>
        </div>
      </div>
      <div class="nb-main">
        <fieldset>
          <legend class="sr">Intent</legend>
          <div class="seg">
            <For each={INTENTS}>
              {(o) => (
                <label>
                  <input
                    type="radio"
                    name={`hd-intent-${id}`}
                    value={o.value}
                    checked={props.note.intent === o.value}
                    aria-describedby={`hd-tt-int-${o.value}-${id}`}
                    onChange={() => props.onChange({ intent: o.value, error: null })}
                  />
                  <span class="o">{o.value}</span>
                  <span class="tt" role="tooltip" id={`hd-tt-int-${o.value}-${id}`}>
                    {o.tip}
                  </span>
                </label>
              )}
            </For>
          </div>
        </fieldset>
        <div>
          <label class="nb-legend" for={`hd-note-text-${id}`}>
            Comment
          </label>
          <textarea
            ref={textarea}
            class="ta"
            id={`hd-note-text-${id}`}
            rows={4}
            value={props.note.comment}
            aria-invalid={props.note.error !== null ? 'true' : undefined}
            aria-describedby={`${errorId} ${counterId}`}
            onInput={(e) => props.onChange({ comment: e.currentTarget.value, error: null })}
          />
          <Show when={props.note.error !== null || counter() !== ''}>
            <div class="ta-row">
              <Show when={props.note.error}>
                {(error) => (
                  <p class="field-err" id={errorId}>
                    <CircleAlert size={14} aria-hidden="true" />
                    <span class="sr">Error:</span>
                    {error()}
                  </p>
                )}
              </Show>
              <Show when={counter() !== ''}>
                <span class="counter" id={counterId}>
                  {counter()}
                </span>
              </Show>
            </div>
          </Show>
        </div>
        <Show when={props.note.showPriority}>
          <fieldset>
            <legend class="nb-legend">Priority</legend>
            <div class="prio-row">
              <div class="seg three">
                <For each={PRIORITIES}>
                  {(p) => (
                    <label>
                      <input
                        type="radio"
                        name={`hd-prio-${id}`}
                        value={p}
                        checked={props.note.priority === p}
                        onChange={() => props.onChange({ priority: p })}
                      />
                      <span class="o">{p}</span>
                    </label>
                  )}
                </For>
              </div>
              <div class="tt-wrap">
                <button
                  class="btn btn-ghost btn-icon"
                  type="button"
                  aria-label="Remove priority"
                  onClick={() => props.onChange({ priority: null, showPriority: false })}
                >
                  <X size={16} aria-hidden="true" />
                </button>
                <span class="tt" role="tooltip">
                  Remove priority
                </span>
              </div>
            </div>
          </fieldset>
        </Show>
      </div>
      <div class="nb-foot">
        <Show when={!props.note.showPriority}>
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            style={{ 'margin-left': '-10px' }}
            onClick={() => props.onChange({ showPriority: true })}
          >
            <Plus size={16} aria-hidden="true" />
            Priority
          </button>
        </Show>
        <span class="grow" />
        <button class="btn btn-primary btn-sm" type="button" onClick={() => props.onSave()}>
          {isEdit() ? 'Save' : 'Add'} <span class="kbd">Ctrl+Enter</span>
        </button>
      </div>
    </div>
  );
}
