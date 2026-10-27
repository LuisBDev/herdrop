import { Button as ButtonPrimitive, type ButtonRootProps } from '@kobalte/core/button';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import { cva, type VariantProps } from 'class-variance-authority';
import { splitProps, type ValidComponent } from 'solid-js';
import { cn } from './utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary enabled:not-aria-disabled:hover:bg-primary-hover',
        outline:
          'bg-surface-1 border-hairline-strong text-ink enabled:not-aria-disabled:hover:bg-surface-3',
        ghost: 'bg-transparent text-ink enabled:not-aria-disabled:hover:bg-surface-3',
        danger:
          'bg-transparent text-semantic-danger enabled:not-aria-disabled:hover:bg-semantic-danger-soft',
        toggle:
          'bg-surface-1 border-hairline-strong text-ink enabled:not-aria-disabled:hover:bg-surface-3 aria-pressed:bg-surface-4 aria-pressed:border-ink-subtle aria-pressed:text-ink',
      },
      size: {
        default: 'h-9 px-3.5 text-sm',
        sm: 'h-8 px-2.5 text-[13px]',
        lg: 'h-10 px-3.5 text-sm',
        icon: 'size-8 p-0',
        'icon-sm': 'size-7 p-0',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
);

type ButtonProps<T extends ValidComponent = 'button'> = ButtonRootProps<T> &
  VariantProps<typeof buttonVariants> & { class?: string };

export function Button<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<T, ButtonProps<T>>,
) {
  const [local, rest] = splitProps(props as ButtonProps, ['class', 'variant', 'size']);
  return (
    <ButtonPrimitive
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      {...rest}
    />
  );
}
