import type { ErrorReporter } from '@/shared/observability';
import type { RenderErrorHandler } from '@/shared/ui/error-boundary';

export function createRenderErrorHandler(reportError: ErrorReporter): RenderErrorHandler {
  return (error, info) => {
    reportError({ source: 'render', error, componentStack: info.componentStack ?? '' });
  };
}
