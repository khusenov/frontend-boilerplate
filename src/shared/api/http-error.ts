export type HttpErrorKind =
  'canceled' | 'client' | 'network' | 'server' | 'timeout' | 'unknown' | 'validation';

export interface ExchangeContext {
  readonly method: string;
  readonly url: string;
  readonly status: number;
}

export interface ResponseValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface HttpErrorDetails {
  readonly kind: HttpErrorKind;
  readonly status: number | null;
  readonly method: string | null;
  readonly url: string | null;
  readonly payload: unknown;
  readonly issues: readonly ResponseValidationIssue[];
}

const UNKNOWN_ERROR_DETAILS: HttpErrorDetails = {
  kind: 'unknown',
  status: null,
  method: null,
  url: null,
  payload: null,
  issues: [],
};

export class HttpError extends Error implements HttpErrorDetails {
  readonly kind: HttpErrorKind;
  readonly status: number | null;
  readonly method: string | null;
  readonly url: string | null;
  readonly payload: unknown;
  readonly issues: readonly ResponseValidationIssue[];

  constructor(message: string, details: HttpErrorDetails, cause: unknown) {
    super(message, { cause });
    this.name = 'HttpError';
    this.kind = details.kind;
    this.status = details.status;
    this.method = details.method;
    this.url = details.url;
    this.payload = details.payload;
    this.issues = details.issues;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown failure';
}

export function toHttpError(error: unknown): HttpError {
  if (isHttpError(error)) {
    return error;
  }

  return new HttpError(toErrorMessage(error), UNKNOWN_ERROR_DETAILS, error);
}
