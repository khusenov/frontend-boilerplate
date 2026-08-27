import { createFormHook } from '@tanstack/react-form';

import { Form } from './form';
import { fieldContext, formContext } from './form-contexts';
import { SubmitButton } from './submit-button';
import { TextField } from './text-field';

export const { useAppForm } = createFormHook({
  fieldComponents: { TextField },
  fieldContext,
  formComponents: { Form, SubmitButton },
  formContext,
});
