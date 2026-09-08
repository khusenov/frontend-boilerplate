import { isAxiosError } from 'axios';
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { toHttpErrorFromAxios } from './axios-error-mapper';
import type { BearerTokenSource } from './bearer-token-source';

const UNAUTHORIZED_STATUS = 401;
const AUTHORIZATION_HEADER = 'Authorization';
const BEARER_PREFIX = 'Bearer ';

declare module 'axios' {
  interface AxiosRequestConfig {
    bearerTokenRenewed?: boolean;
  }
}

type ReplayableRequestFailure = AxiosError & { config: InternalAxiosRequestConfig };

function isReplayableUnauthorized(error: unknown): error is ReplayableRequestFailure {
  if (!isAxiosError(error) || error.response?.status !== UNAUTHORIZED_STATUS) {
    return false;
  }

  return error.config !== undefined && error.config.bearerTokenRenewed !== true;
}

function readSentToken(config: InternalAxiosRequestConfig): string | null {
  const header: unknown = config.headers.get(AUTHORIZATION_HEADER);

  return typeof header === 'string' && header.startsWith(BEARER_PREFIX)
    ? header.slice(BEARER_PREFIX.length)
    : null;
}

async function renewQuietly(source: BearerTokenSource, staleToken: string | null) {
  try {
    return await source.renewToken(staleToken);
  } catch {
    return null;
  }
}

function sendToken(instance: AxiosInstance, source: BearerTokenSource): void {
  instance.interceptors.request.use((config) => {
    const token = source.getToken();

    if (token === null) {
      config.headers.delete(AUTHORIZATION_HEADER);
    } else {
      config.headers.set(AUTHORIZATION_HEADER, `${BEARER_PREFIX}${token}`);
    }

    return config;
  });
}

function replayAfterRenewal(instance: AxiosInstance, source: BearerTokenSource): void {
  instance.interceptors.response.use(undefined, async (error: unknown) => {
    if (!isReplayableUnauthorized(error)) {
      return Promise.reject(toHttpErrorFromAxios(error));
    }

    const token = await renewQuietly(source, readSentToken(error.config));

    if (token === null) {
      return Promise.reject(toHttpErrorFromAxios(error));
    }

    return instance.request({ ...error.config, bearerTokenRenewed: true });
  });
}

export function attachBearerToken(instance: AxiosInstance, source: BearerTokenSource): void {
  sendToken(instance, source);
  replayAfterRenewal(instance, source);
}
