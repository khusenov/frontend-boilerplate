import { hashKey, MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { DefaultOptions } from '@tanstack/react-query';

import type { HttpErrorKind } from './http-error';
import { isHttpError } from './http-error';

const STALE_TIME_MILLISECONDS = 30_000;
const GARBAGE_COLLECTION_TIME_MILLISECONDS = 300_000;
const MAX_QUERY_RETRIES = 2;
const TOO_MANY_REQUESTS_STATUS = 429;

const RETRYABLE_ERROR_KINDS: readonly HttpErrorKind[] = ['network', 'server', 'timeout'];

function isRetryableFailure(error: Error): boolean {
  if (!isHttpError(error)) {
    return false;
  }

  return RETRYABLE_ERROR_KINDS.includes(error.kind) || error.status === TOO_MANY_REQUESTS_STATUS;
}

function shouldRetryQuery(failureCount: number, error: Error): boolean {
  return isRetryableFailure(error) && failureCount < MAX_QUERY_RETRIES;
}

export interface CreateQueryClientOptions {
  readonly onQueryError?: ((error: unknown, queryHash: string) => void) | undefined;
  readonly onMutationError?: ((error: unknown, mutationHash: string) => void) | undefined;
  readonly defaultOptions?: DefaultOptions | undefined;
}

export function createQueryClient({
  onQueryError = () => undefined,
  onMutationError = () => undefined,
  defaultOptions = {},
}: CreateQueryClientOptions = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        onQueryError(error, query.queryHash);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        onMutationError(error, hashKey(mutation.options.mutationKey ?? []));
      },
    }),
    defaultOptions: {
      ...defaultOptions,
      queries: {
        staleTime: STALE_TIME_MILLISECONDS,
        gcTime: GARBAGE_COLLECTION_TIME_MILLISECONDS,
        retry: shouldRetryQuery,
        ...defaultOptions.queries,
      },
      mutations: {
        retry: false,
        ...defaultOptions.mutations,
      },
    },
  });
}
