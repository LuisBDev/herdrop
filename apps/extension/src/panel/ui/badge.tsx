import { cva, type VariantProps } from 'class-variance-authority';
import { type ComponentProps, splitProps } from 'solid-js';
import { cn } from './utils';

export const badgeVariants = cva(
  'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border border-hairline bg-surface-2 px-[7px] text-xs font-medium text-ink-muted',
  {
    variants: {
      variant: {
        default: '',
        mono: 'font-mono font-normal',
        focus: 'bg-surface-4 text-ink',
        'prio-blocking': 'bg-semantic-danger-soft text-semantic-danger',
        'prio-important': 'bg-semantic-warning-soft text-semantic-warning',
        'prio-suggestion': 'bg-surface-3 text-ink-subtle',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge(props: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  const [local, rest] = splitProps(props, ['class', 'variant']);
  return <span class={cn(badgeVariants({ variant: local.variant }), local.class)} {...rest} />;
}
