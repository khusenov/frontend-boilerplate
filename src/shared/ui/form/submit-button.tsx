import type { ReactNode } from 'react';

import { Button } from '@/shared/ui/button';
import type { ButtonProps } from '@/shared/ui/button';

import { useFormContext } from './form-contexts';

type PlainButtonProps = Extract<ButtonProps, { asChild?: false | undefined }>;

type FormManagedButtonPropName = 'aria-busy' | 'asChild' | 'children' | 'type';

export interface SubmitButtonProps extends Omit<PlainButtonProps, FormManagedButtonPropName> {
  readonly children: ReactNode;
  readonly pendingLabel?: ReactNode | undefined;
}

export function SubmitButton({
  children,
  disabled,
  pendingLabel,
  ...buttonProps
}: SubmitButtonProps) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button
          {...buttonProps}
          aria-busy={isSubmitting}
          disabled={isSubmitting || disabled === true}
          type="submit"
        >
          {isSubmitting && pendingLabel !== undefined ? pendingLabel : children}
        </Button>
      )}
    </form.Subscribe>
  );
}
