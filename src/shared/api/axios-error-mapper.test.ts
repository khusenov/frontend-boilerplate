import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { toHttpErrorFromAxios } from './axios-error-mapper';

function createConfig(method?: string): InternalAxiosRequestConfig {
  return {
    ...(method === undefined ? {} : { method }),
    url: '/things',
    headers: new AxiosHeaders(),
  };
}

function createResponse(status: number, data: unknown): AxiosResponse {
  return { data, status, statusText: '', headers: new AxiosHeaders(), config: createConfig('get') };
}

function createAxiosError(code: string, response?: AxiosResponse): AxiosError {
  return new AxiosError('failed', code, createConfig('get'), undefined, response);
}

describe('toHttpErrorFromAxios', () => {
  it('maps a cancellation to the canceled kind', () => {
    expect(toHttpErrorFromAxios(createAxiosError(AxiosError.ERR_CANCELED))).toMatchObject({
      kind: 'canceled',
      status: null,
    });
  });

  it('maps ECONNABORTED to the timeout kind', () => {
    expect(toHttpErrorFromAxios(createAxiosError(AxiosError.ECONNABORTED))).toMatchObject({
      kind: 'timeout',
    });
  });

  it('maps ETIMEDOUT to the timeout kind', () => {
    expect(toHttpErrorFromAxios(createAxiosError(AxiosError.ETIMEDOUT))).toMatchObject({
      kind: 'timeout',
    });
  });

  it('maps a responseless failure to the network kind', () => {
    expect(toHttpErrorFromAxios(createAxiosError(AxiosError.ERR_NETWORK))).toMatchObject({
      kind: 'network',
      payload: null,
    });
  });

  it('maps a 4xx response to the client kind and keeps the payload', () => {
    const error = createAxiosError(AxiosError.ERR_BAD_REQUEST, createResponse(404, { d: 1 }));

    expect(toHttpErrorFromAxios(error)).toMatchObject({
      kind: 'client',
      status: 404,
      payload: { d: 1 },
    });
  });

  it('maps a 5xx response to the server kind', () => {
    const error = createAxiosError(AxiosError.ERR_BAD_RESPONSE, createResponse(503, null));

    expect(toHttpErrorFromAxios(error)).toMatchObject({ kind: 'server', status: 503 });
  });

  it('records the request method in upper case and the url', () => {
    expect(toHttpErrorFromAxios(createAxiosError(AxiosError.ERR_NETWORK))).toMatchObject({
      method: 'GET',
      url: '/things',
    });
  });

  it('leaves the method null when the request config carries none', () => {
    const error = new AxiosError('failed', AxiosError.ERR_NETWORK, createConfig());

    expect(toHttpErrorFromAxios(error)).toMatchObject({ method: null, url: '/things' });
  });

  it('leaves the method and url null when there is no request config', () => {
    expect(toHttpErrorFromAxios(new AxiosError('failed', AxiosError.ERR_NETWORK))).toMatchObject({
      method: null,
      url: null,
    });
  });

  it('keeps the axios message as the diagnostic message and the error as the cause', () => {
    const cause = createAxiosError(AxiosError.ERR_NETWORK);
    const httpError = toHttpErrorFromAxios(cause);

    expect(httpError.message).toBe('failed');
    expect(httpError.cause).toBe(cause);
  });

  it('delegates a non-axios error to the generic mapper', () => {
    expect(toHttpErrorFromAxios(new Error('boom'))).toMatchObject({
      kind: 'unknown',
      message: 'boom',
    });
  });
});
