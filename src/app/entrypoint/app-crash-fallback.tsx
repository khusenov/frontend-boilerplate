import { useEffect, useRef } from 'react';

import { Button } from '@/shared/ui/button';
import type { ErrorFallbackProps } from '@/shared/ui/error-boundary';

export function AppCrashFallback({
  resetErrorBoundary,
}: Pick<ErrorFallbackProps, 'resetErrorBoundary'>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-4 p-8">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Something went wrong
      </h1>
      <p className="text-sm text-muted-foreground">
        The application could not start. Trying again may fix it.
      </p>
      <Button onClick={resetErrorBoundary}>Try again</Button>
    </main>
  );
}
