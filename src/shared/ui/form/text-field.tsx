import { useTranslation } from '@/shared/i18n';
import { Input } from '@/shared/ui/input';
import type { InputProps } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

import { useFieldContext } from './form-contexts';
import { useFieldReveal } from './use-field-reveal';

type FieldManagedInputPropName =
  'aria-invalid' | 'defaultValue' | 'name' | 'onBlur' | 'onChange' | 'value';

type NarrowedInputPropName = 'type';

type OmittedInputPropName = FieldManagedInputPropName | NarrowedInputPropName;

export type TextFieldInputType = 'email' | 'password' | 'search' | 'tel' | 'text' | 'url';

export interface TextFieldProps extends Omit<InputProps, OmittedInputPropName> {
  readonly label: string;
  readonly description?: string | undefined;
  readonly type?: TextFieldInputType | undefined;
}

function toTextValue(value: unknown, fieldName: string): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new TypeError(
      `TextField requires a string field, but "${fieldName}" holds ${typeof value}.`,
    );
  }

  return value;
}

export function TextField({
  'aria-describedby': callerDescribedBy,
  description,
  id: callerId,
  label,
  ...inputProps
}: TextFieldProps) {
  const { t } = useTranslation();
  const field = useFieldContext<unknown>();
  const aria = useFieldReveal(field, {
    describedBy: callerDescribedBy,
    fallbackMessage: t('validation.invalid'),
    hasDescription: description !== undefined,
    id: callerId,
  });

  return (
    <div className="grid gap-2" data-slot="text-field">
      <Label htmlFor={aria.controlId}>{label}</Label>
      <Input
        {...inputProps}
        aria-describedby={aria.describedBy}
        aria-invalid={aria.isInvalid}
        id={aria.controlId}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(event) => {
          field.handleChange(event.target.value);
        }}
        value={toTextValue(field.state.value, field.name)}
      />
      {description !== undefined && (
        <p className="text-sm text-muted-foreground" id={aria.descriptionId}>
          {description}
        </p>
      )}
      {aria.isInvalid && (
        <div className="text-sm text-destructive" id={aria.errorId} role="alert">
          <ul className="grid gap-1">
            {aria.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
