import type { StandardSchemaV1 } from '@standard-schema/spec';

import type { ExchangeContext } from './http-error';
import { toSchemaFailureError, toValidationError } from './validation-error-mapper';

const EMPTY_BODY_MESSAGE = 'Expected an empty response body';
const EMPTY_BODY_VALUES: readonly unknown[] = ['', null, undefined];
const SCHEMA_VENDOR = 'frontend-boilerplate';

export type ResponseSchema<TValue> = StandardSchemaV1<unknown, TValue>;

async function validate<TValue>(
  schema: ResponseSchema<TValue>,
  body: unknown,
  context: ExchangeContext,
): Promise<StandardSchemaV1.Result<TValue>> {
  try {
    return await schema['~standard'].validate(body);
  } catch (error: unknown) {
    throw toSchemaFailureError(error, context);
  }
}

export async function parseResponse<TValue>(
  schema: ResponseSchema<TValue>,
  body: unknown,
  context: ExchangeContext,
): Promise<TValue> {
  const result = await validate(schema, body, context);

  if (result.issues) {
    throw toValidationError(result.issues, context);
  }

  return result.value;
}

export const noContentSchema: ResponseSchema<null> = {
  '~standard': {
    version: 1,
    vendor: SCHEMA_VENDOR,
    validate: (value: unknown) =>
      EMPTY_BODY_VALUES.includes(value)
        ? { value: null }
        : { issues: [{ message: EMPTY_BODY_MESSAGE }] },
  },
};
