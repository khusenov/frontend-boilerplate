import type { ComponentProps } from 'react';

import { useFormContext } from './form-contexts';

export type FormProps = Omit<ComponentProps<'form'>, 'noValidate' | 'onSubmit'> & {
  readonly onSubmitError?: ((error: unknown) => void) | undefined;
};

export function Form({ children, onSubmitError, ...formProps }: FormProps) {
  const form = useFormContext();

  return (
    <form
      {...formProps}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit().catch((error: unknown) => {
          onSubmitError?.(error);
        });
      }}
    >
      {children}
    </form>
  );
}
