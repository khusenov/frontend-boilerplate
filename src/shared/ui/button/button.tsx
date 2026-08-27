import type { VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps, ReactElement } from 'react';

import { cn } from '@/shared/lib/cn';

import { buttonVariants } from './button-variants';

export type ButtonProps = VariantProps<typeof buttonVariants> &
  (
    | ({ asChild?: false | undefined } & ComponentProps<'button'>)
    | ({ asChild: true } & Omit<ComponentProps<typeof Slot.Root>, 'children'> & {
          children: ReactElement;
        })
  );

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, className }));
  const dataAttributes = { 'data-slot': 'button', 'data-variant': variant, 'data-size': size };

  if (props.asChild === true) {
    const { asChild, ...slotProps } = props;
    return <Slot.Root {...dataAttributes} className={classes} {...slotProps} />;
  }

  const { asChild, type = 'button', ...buttonProps } = props;
  return <button {...dataAttributes} className={classes} type={type} {...buttonProps} />;
}
