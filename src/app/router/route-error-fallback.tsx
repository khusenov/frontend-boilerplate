import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { isNotFound, notFound, useMatch, useRouter } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { useEffect } from 'react';

import { RouteErrorPage } from '@/pages/route-error';

function useRetryFailedRoute(): () => void {
  const router = useRouter();
  const failedMatchId = useMatch({
    strict: false,
    shouldThrow: false,
    select: (match) => match.id,
  });

  return () => {
    void router.invalidate({
      filter: (match) => match.id === failedMatchId,
      forcePending: true,
      sync: true,
    });
  };
}

function useResetQueryErrorsOnMount() {
  const queryErrorResetBoundary = useQueryErrorResetBoundary();

  useEffect(() => {
    queryErrorResetBoundary.reset();
  }, [queryErrorResetBoundary]);
}

function RouteErrorRecovery() {
  const retry = useRetryFailedRoute();
  useResetQueryErrorsOnMount();

  return <RouteErrorPage onRetry={retry} />;
}

export function RouteErrorFallback({ error }: Readonly<Pick<ErrorComponentProps, 'error'>>) {
  if (isNotFound(error)) {
    notFound({ ...error, throw: true });
  }

  return <RouteErrorRecovery />;
}
