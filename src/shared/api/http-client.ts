import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import { toHttpErrorFromAxios } from './axios-error-mapper';

const DEFAULT_TIMEOUT_MILLISECONDS = 15_000;
const JSON_MEDIA_TYPE = 'application/json';
const REDACTED_HEADERS: readonly string[] = ['authorization', 'cookie', 'set-cookie'];

type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type HttpQueryParamValue = boolean | number | string;

export type HttpQueryParams = Record<
  string,
  HttpQueryParamValue | readonly HttpQueryParamValue[] | undefined
>;

export type AuthHeadersReader = () => Record<string, string>;

export interface HttpRequestOptions {
  readonly params?: HttpQueryParams;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
}

export interface HttpClient {
  readonly get: <TResponse>(url: string, options?: HttpRequestOptions) => Promise<TResponse>;
  readonly post: <TResponse>(
    url: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ) => Promise<TResponse>;
  readonly put: <TResponse>(
    url: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ) => Promise<TResponse>;
  readonly patch: <TResponse>(
    url: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ) => Promise<TResponse>;
  readonly delete: <TResponse>(url: string, options?: HttpRequestOptions) => Promise<TResponse>;
}

export interface CreateHttpClientOptions {
  readonly baseUrl: string;
  readonly timeoutMilliseconds?: number;
  readonly getAuthHeaders?: AuthHeadersReader;
  readonly redactedHeaders?: readonly string[];
}

function attachAuthHeaders(instance: AxiosInstance, getAuthHeaders: AuthHeadersReader): void {
  instance.interceptors.request.use((config) => {
    for (const [name, value] of Object.entries(getAuthHeaders())) {
      config.headers.set(name, value);
    }

    return config;
  });
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
    redact: [...(options.redactedHeaders ?? REDACTED_HEADERS)],
  });

  const { getAuthHeaders } = options;

  if (getAuthHeaders) {
    attachAuthHeaders(instance, getAuthHeaders);
  }

  normalizeErrors(instance);

  return instance;
}

async function sendRequest<TResponse>(
  instance: AxiosInstance,
  method: HttpMethod,
  url: string,
  options: HttpRequestOptions,
  body?: unknown,
): Promise<TResponse> {
  const config: AxiosRequestConfig = {
    ...options,
    method,
    url,
    ...(body === undefined ? {} : { data: body }),
  };

  const response = await instance.request<TResponse>(config);

  return response.data;
}

export function createHttpClient(options: CreateHttpClientOptions): HttpClient {
  const instance = createInstance(options);

  return {
    get: <TResponse>(url: string, requestOptions: HttpRequestOptions = {}) =>
      sendRequest<TResponse>(instance, 'GET', url, requestOptions),
    post: <TResponse>(url: string, body?: unknown, requestOptions: HttpRequestOptions = {}) =>
      sendRequest<TResponse>(instance, 'POST', url, requestOptions, body),
    put: <TResponse>(url: string, body?: unknown, requestOptions: HttpRequestOptions = {}) =>
      sendRequest<TResponse>(instance, 'PUT', url, requestOptions, body),
    patch: <TResponse>(url: string, body?: unknown, requestOptions: HttpRequestOptions = {}) =>
      sendRequest<TResponse>(instance, 'PATCH', url, requestOptions, body),
    delete: <TResponse>(url: string, requestOptions: HttpRequestOptions = {}) =>
      sendRequest<TResponse>(instance, 'DELETE', url, requestOptions),
  };
}
