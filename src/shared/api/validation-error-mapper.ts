import type { StandardSchemaV1 } from '@standard-schema/spec';

import type {
  ExchangeContext,
  HttpErrorDetails,
  HttpErrorKind,
  ResponseValidationIssue,
} from './http-error';
import { HttpError } from './http-error';

const VALIDATION_ERROR_MESSAGE = 'Response did not match the expected schema';
const SCHEMA_FAILURE_MESSAGE = 'Response schema threw while validating';

function toIssuePath(path: StandardSchemaV1.Issue['path']): string {
  if (path === undefined) {
    return '';
  }

  return path
    .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
    .join('.');
}

function toErrorDetails(
  kind: HttpErrorKind,
  context: ExchangeContext,
  issues: readonly ResponseValidationIssue[],
): HttpErrorDetails {
  return {
    kind,
    status: context.status,
    method: context.method,
    url: context.url,
    payload: null,
    issues,
  };
}

export function toValidationError(
  issues: readonly StandardSchemaV1.Issue[],
  context: ExchangeContext,
): HttpError {
  const details = toErrorDetails(
    'validation',
    context,
    issues.map((issue) => ({ path: toIssuePath(issue.path), message: issue.message })),
  );

  return new HttpError(VALIDATION_ERROR_MESSAGE, details, null);
}

export function toSchemaFailureError(cause: unknown, context: ExchangeContext): HttpError {
  return new HttpError(SCHEMA_FAILURE_MESSAGE, toErrorDetails('unknown', context, []), cause);
}
