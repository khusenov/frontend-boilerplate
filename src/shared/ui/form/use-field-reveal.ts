import { useSelector } from '@tanstack/react-form';
import type { AnyFormApi } from '@tanstack/react-form';

import type { FieldAria, FieldAriaOptions, FieldAriaSource } from './use-field-aria';
import { useFieldAria } from './use-field-aria';

export type FieldRevealSource = FieldAriaSource & { readonly form: AnyFormApi };

export type FieldRevealOptions = Omit<FieldAriaOptions, 'hasSubmitted'>;

export function useFieldReveal(field: FieldRevealSource, options: FieldRevealOptions): FieldAria {
  const hasSubmitted = useSelector(field.form.store, (state) => state.submissionAttempts > 0);

  return useFieldAria(field, { ...options, hasSubmitted });
}
