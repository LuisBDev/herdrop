import { Tooltip as TooltipPrimitive } from '@kobalte/core/tooltip';
import type { JSX } from 'solid-js';
import { cn } from './utils';

function forward(type: 'focus' | 'blur') {
  return (e: FocusEvent) => {
    e.currentTarget?.dispatchEvent(new FocusEvent(type, { relatedTarget: e.relatedTarget }));
  };
}

export function Tooltip(props: {
  content: string;
  wrap?: boolean;
  placement?: 'top' | 'bottom' | 'bottom-start' | 'bottom-end';
  children: JSX.Element;
}) {
  return (
    <TooltipPrimitive openDelay={300} placement={props.placement ?? 'top'} gutter={4}>
      <TooltipPrimitive.Trigger
        as="span"
        class="inline-flex"
        on:focusin={forward('focus')}
        on:focusout={forward('blur')}
      >
        {props.children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          class={cn(
            'z-30 rounded-sm bg-ink px-2 py-1.5 text-xs leading-[1.35] text-canvas',
            props.wrap ? 'w-[248px] whitespace-normal' : 'whitespace-nowrap',
          )}
        >
          {props.content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive>
  );
}
