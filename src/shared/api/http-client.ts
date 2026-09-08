import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import { attachBearerToken } from './attach-bearer-token';
import { toHttpErrorFromAxios } from './axios-error-mapper';
import type { BearerTokenSource } from './bearer-token-source';
import type { ExchangeContext } from './http-error';
import type { ResponseSchema } from './response-schema';
import { parseResponse } from './response-schema';

const DEFAULT_TIMEOUT_MILLISECONDS = 15_000;
const JSON_MEDIA_TYPE = 'application/json';
const REDACTED_HEADERS: readonly string[] = ['authorization', 'cookie', 'set-cookie'];

type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type HttpQueryParamValue = boolean | number | string;

export type HttpQueryParams = Record<
  string,
  HttpQueryParamValue | readonly HttpQueryParamValue[] | undefined
>;

export interface HttpRequestOptions {
  readonly params?: HttpQueryParams;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
}

interface HttpBodyOptions extends HttpRequestOptions {
  readonly body?: unknown;
}

export interface HttpRequestConfig<TValue> extends HttpRequestOptions {
  readonly schema: ResponseSchema<TValue>;
}

export type HttpBodyRequestConfig<TValue> = HttpRequestConfig<TValue> & HttpBodyOptions;

export interface HttpClient {
  readonly get: <TValue>(url: string, config: HttpRequestConfig<TValue>) => Promise<TValue>;
  readonly post: <TValue>(url: string, config: HttpBodyRequestConfig<TValue>) => Promise<TValue>;
  readonly put: <TValue>(url: string, config: HttpBodyRequestConfig<TValue>) => Promise<TValue>;
  readonly patch: <TValue>(url: string, config: HttpBodyRequestConfig<TValue>) => Promise<TValue>;
  readonly delete: <TValue>(url: string, config: HttpRequestConfig<TValue>) => Promise<TValue>;
}

export interface CreateHttpClientOptions {
  readonly baseUrl: string;
  readonly timeoutMilliseconds?: number;
  readonly bearerTokenSource?: BearerTokenSource;
  readonly sendCookies?: boolean;
  readonly redactedHeaders?: readonly string[];
}

function normalizeErrors(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => Promise.reject(toHttpErrorFromAxios(error)),
  );
}

function createInstance(options: CreateHttpClientOptions): AxiosInstance {
  const instance = axios.create({
    baseURL: options.baseUrl,
    timeout: options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS,
    headers: { Accept: JSON_MEDIA_TYPE },
    allowAbsoluteUrls: false,
    withCredentials: options.sendCookies ?? false,
    redact: [...(options.redactedHeaders ?? REDACTED_HEADERS)],
  });

  const { bearerTokenSource } = options;

  if (bearerTokenSource) {
    attachBearerToken(instance, bearerTokenSource);
  }

  normalizeErrors(instance);

  return instance;
}

function toAxiosRequestConfig(
  method: HttpMethod,
  url: string,
  requestConfig: HttpBodyOptions,
): AxiosRequestConfig {
  const { body, params, headers, signal } = requestConfig;

  return {
    method,
    url,
    ...(params === undefined ? {} : { params }),
    ...(headers === undefined ? {} : { headers }),
    ...(signal === undefined ? {} : { signal }),
    ...(body === undefined ? {} : { data: body }),
  };
}

async function sendRequest<TValue>(
  instance: AxiosInstance,
  method: HttpMethod,
  url: string,
  requestConfig: HttpBodyRequestConfig<TValue>,
): Promise<TValue> {
  const config = toAxiosRequestConfig(method, url, requestConfig);
  const response = await instance.request<unknown>(config);
  const context: ExchangeContext = { method, url, status: response.status };

  return parseResponse(requestConfig.schema, response.data, context);
}

export function createHttpClient(options: CreateHttpClientOptions): HttpClient {
  const instance = createInstance(options);

  return {
    get: <TValue>(url: string, config: HttpRequestConfig<TValue>) =>
      sendRequest<TValue>(instance, 'GET', url, config),
    post: <TValue>(url: string, config: HttpBodyRequestConfig<TValue>) =>
      sendRequest<TValue>(instance, 'POST', url, config),
    put: <TValue>(url: string, config: HttpBodyRequestConfig<TValue>) =>
      sendRequest<TValue>(instance, 'PUT', url, config),
    patch: <TValue>(url: string, config: HttpBodyRequestConfig<TValue>) =>
      sendRequest<TValue>(instance, 'PATCH', url, config),
    delete: <TValue>(url: string, config: HttpRequestConfig<TValue>) =>
      sendRequest<TValue>(instance, 'DELETE', url, config),
  };
}
