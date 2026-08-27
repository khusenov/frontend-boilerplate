import { useId } from 'react';

import { toFieldErrorMessages } from './field-error-messages';

const CONTROL_ID_SUFFIX = '-control';
const DESCRIPTION_ID_SUFFIX = '-description';
const ERROR_ID_SUFFIX = '-error';

export interface FieldAriaSource {
  readonly state: {
    readonly meta: {
      readonly errors: unknown;
      readonly isBlurred: boolean;
      readonly isValid: boolean;
    };
  };
}

export interface FieldAriaOptions {
  readonly fallbackMessage: string;
  readonly hasDescription: boolean;
  readonly hasSubmitted: boolean;
  readonly describedBy?: string | undefined;
  readonly id?: string | undefined;
}

export interface FieldAria {
  readonly controlId: string;
  readonly describedBy: string | undefined;
  readonly descriptionId: string;
  readonly errorId: string;
  readonly isInvalid: boolean;
  readonly messages: readonly string[];
}

function toDisplayMessages(
  errors: unknown,
  isInvalid: boolean,
  fallbackMessage: string,
): readonly string[] {
  if (!isInvalid) {
    return [];
  }

  const parsed = toFieldErrorMessages(errors);

  return parsed.length > 0 ? parsed : [fallbackMessage];
}

export function useFieldAria(field: FieldAriaSource, options: FieldAriaOptions): FieldAria {
  const generatedId = useId();
  const controlId = options.id ?? `${generatedId}${CONTROL_ID_SUFFIX}`;
  const descriptionId = `${controlId}${DESCRIPTION_ID_SUFFIX}`;
  const errorId = `${controlId}${ERROR_ID_SUFFIX}`;

  const { isBlurred, isValid } = field.state.meta;
  const isInvalid = (isBlurred || options.hasSubmitted) && !isValid;
  const messages = toDisplayMessages(field.state.meta.errors, isInvalid, options.fallbackMessage);

  const describedBy = [
    options.hasDescription ? descriptionId : undefined,
    isInvalid ? errorId : undefined,
    options.describedBy,
  ]
    .filter((token) => token !== undefined)
    .join(' ');

  return {
    controlId,
    describedBy: describedBy === '' ? undefined : describedBy,
    descriptionId,
    errorId,
    isInvalid,
    messages,
  };
}
