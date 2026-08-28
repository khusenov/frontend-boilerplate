import { AxiosError, isAxiosError } from 'axios';

import type { HttpErrorDetails, HttpErrorKind } from './http-error';
import { HttpError, toHttpError } from './http-error';

const MIN_SERVER_ERROR_STATUS = 500;

function classifyErrorKind(error: AxiosError): HttpErrorKind {
  if (error.code === AxiosError.ERR_CANCELED) {
    return 'canceled';
  }

  if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
    return 'timeout';
  }

  if (!error.response) {
    return 'network';
  }

  return error.response.status >= MIN_SERVER_ERROR_STATUS ? 'server' : 'client';
}

function toErrorDetails(error: AxiosError): HttpErrorDetails {
  const { response } = error;

  return {
    kind: classifyErrorKind(error),
    status: response?.status ?? null,
    method: error.config?.method?.toUpperCase() ?? null,
    url: error.config?.url ?? null,
    payload: response?.data ?? null,
    issues: [],
  };
}

export function toHttpErrorFromAxios(error: unknown): HttpError {
  if (!isAxiosError(error)) {
    return toHttpError(error);
  }

  return new HttpError(error.message, toErrorDetails(error), error);
}
