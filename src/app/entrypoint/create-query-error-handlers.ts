import type { ErrorReporter } from '@/shared/observability';

export interface QueryErrorHandlers {
  readonly onQueryError: (error: unknown, queryHash: string) => void;
  readonly onMutationError: (error: unknown, mutationHash: string) => void;
}

export function createQueryErrorHandlers(reportError: ErrorReporter): QueryErrorHandlers {
  return {
    onQueryError: (error, queryHash) => {
      reportError({ source: 'query', error, queryHash });
    },
    onMutationError: (error, mutationHash) => {
      reportError({ source: 'mutation', error, mutationHash });
    },
  };
}
