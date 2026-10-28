import { Check, Copy, ExternalLink, EyeOff, Pencil, Trash } from 'lucide-solid';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { copyText } from '../../lib/clipboard.ts';
import { renderClipboardOne } from '../../render/clipboard.ts';
import { usePanel } from '../state.ts';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { cn } from '../ui/utils';
import type { Item } from './annotations-view.ts';
import type { HoverSync } from './hover-sync.ts';

const COPIED_MS = 2000;

export function AnnotationItem(props: {
  item: Item;
  locked: boolean;
  linked: boolean;
  scrollWhenLinked: boolean;
  sync: HoverSync;
  onDelete(id: string): void;
}) {
  const panel = usePanel();
  const [copied, setCopied] = createSignal(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let row: HTMLLIElement | undefined;

  onCleanup(() => clearTimeout(copiedTimer));

  createEffect(() => {
    if (!props.linked || !props.scrollWhenLinked || row === undefined) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  });

  const enter = () => {
    if (props.item.otherPage) return;
    props.sync.enter(props.item.id);
  };

  const leave = (event: MouseEvent | FocusEvent) => {
    if (event instanceof FocusEvent && row?.contains(event.relatedTarget as Node | null)) return;
    props.sync.leave();
  };

  const copy = async () => {
    const number = props.item.number;
    const annotation = panel.draft().annotations.find((a) => a.id === props.item.id);
    if (annotation === undefined) return;
    const ok = await copyText(renderClipboardOne(annotation, number));
    if (!ok) {
      panel.feedback.showToast('Copy failed. Click the panel and try again.');
      return;
    }
    panel.feedback.showToast(`Copied annotation ${number}`);
    panel.feedback.announce(`Copied annotation ${number}`);
    clearTimeout(copiedTimer);
    setCopied(true);
    copiedTimer = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const edit = () => {
    if (!props.item.editable) return;
    void panel.sendToTab('openEditor', { annotationId: props.item.id });
  };

  return (
    <li
      ref={row}
      class={cn(
        'grid grid-cols-[22px_minmax(0,1fr)_auto] gap-2.5 rounded-md border-t border-hairline px-2 py-2.5 transition-[background-color,box-shadow] duration-150 ease-out first:border-t-transparent [.linked+&]:border-t-transparent',
        props.linked &&
          'linked border-t-transparent bg-surface-3 shadow-[inset_0_0_0_1px_var(--hairline-strong)]',
      )}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocusIn={enter}
      onFocusOut={leave}
    >
      <span
        aria-hidden="true"
        class="inline-flex size-[22px] flex-none items-center justify-center rounded-full border border-hairline-strong bg-surface-3 text-xs font-semibold tabular-nums text-ink"
      >
        {props.item.number}
      </span>
      <div class="min-w-0">
        <p class="text-[13px] font-medium wrap-anywhere">
          <span class="sr-only">Annotation {props.item.number}: </span>
          {props.item.what}
        </p>
        <p class="font-mono text-xs text-ink-subtle wrap-anywhere">{props.item.element}</p>
        <p class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span class="inline-flex h-5 items-center rounded-full border border-hairline-strong px-[7px] text-xs font-medium text-ink-muted">
            {props.item.intent}
          </span>
          <Show when={props.item.priorityClass}>
            {(variant) => <Badge variant={variant()}>{props.item.priority}</Badge>}
          </Show>
          <Show when={props.item.offScreen}>
            <Tooltip content="Off screen">
              <span class="inline-flex items-center text-ink-subtle">
                <EyeOff size={14} aria-hidden="true" />
                <span class="sr-only">, off screen</span>
              </span>
            </Tooltip>
          </Show>
          <Show when={props.item.otherPage}>
            <Tooltip content="Other page">
              <span class="inline-flex items-center text-ink-subtle">
                <ExternalLink size={14} aria-hidden="true" />
                <span class="sr-only">, on another page</span>
              </span>
            </Tooltip>
          </Show>
        </p>
        <p class="mt-1.5 text-pretty wrap-anywhere">{props.item.comment}</p>
      </div>
      <div class="flex items-start">
        <Tooltip content={copied() ? 'Copied' : 'Copy annotation'}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Copy annotation ${props.item.number}`}
            onClick={() => void copy()}
          >
            <Show when={copied()} fallback={<Copy size={16} aria-hidden="true" />}>
              <Check size={16} aria-hidden="true" class="text-semantic-success" />
            </Show>
          </Button>
        </Tooltip>
        <Show when={!props.locked}>
          <Tooltip content={props.item.editTip}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit annotation ${props.item.number}`}
              aria-disabled={props.item.editable ? undefined : 'true'}
              onClick={edit}
            >
              <Pencil size={16} aria-hidden="true" />
            </Button>
          </Tooltip>
          <Tooltip content="Delete">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete annotation ${props.item.number}`}
              onClick={() => props.onDelete(props.item.id)}
            >
              <Trash size={16} aria-hidden="true" />
            </Button>
          </Tooltip>
        </Show>
      </div>
    </li>
  );
}
