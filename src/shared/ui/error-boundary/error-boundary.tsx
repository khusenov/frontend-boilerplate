import type { ComponentType, ErrorInfo, ReactNode } from 'react';
import { ErrorBoundary as ErrorBoundaryPrimitive } from 'react-error-boundary';

export interface ErrorFallbackProps {
  readonly error: unknown;
  readonly resetErrorBoundary: () => void;
}

export type RenderErrorHandler = (error: unknown, info: ErrorInfo) => void;

export interface ErrorBoundaryProps {
  readonly FallbackComponent: ComponentType<ErrorFallbackProps>;
  readonly onError?: RenderErrorHandler | undefined;
  readonly children: ReactNode;
}

export function ErrorBoundary({
  FallbackComponent,
  onError = () => undefined,
  children,
}: ErrorBoundaryProps) {
  return (
    <ErrorBoundaryPrimitive FallbackComponent={FallbackComponent} onError={onError}>
      {children}
    </ErrorBoundaryPrimitive>
  );
}
