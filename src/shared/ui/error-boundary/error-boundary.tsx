import type { ComponentType, ErrorInfo, ReactNode } from 'react';
import { ErrorBoundary as ErrorBoundaryPrimitive } from 'react-error-boundary';

export interface ErrorFallbackProps {
  readonly error: unknown;
  readonly resetErrorBoundary: () => void;
}

export type ErrorReporter = (error: unknown, info: ErrorInfo) => void;

export interface ErrorBoundaryProps {
  readonly FallbackComponent: ComponentType<ErrorFallbackProps>;
  readonly onError?: ErrorReporter | undefined;
  readonly children: ReactNode;
}

export function ErrorBoundary({ FallbackComponent, onError, children }: ErrorBoundaryProps) {
  return (
    <ErrorBoundaryPrimitive
      FallbackComponent={FallbackComponent}
      {...(onError === undefined ? {} : { onError })}
    >
      {children}
    </ErrorBoundaryPrimitive>
  );
}
