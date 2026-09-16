import { appConfig } from '@/shared/config';
import { ErrorBoundary } from '@/shared/ui/error-boundary';

import { AppRouterProvider } from '../router/app-router-provider';

import { AppCrashFallback } from './app-crash-fallback';
import { reportError } from './app-error-reporter';
import { notify } from './app-notifier';
import { AppProviders } from './app-providers';
import { createQueryErrorHandlers } from './create-query-error-handlers';
import { createRenderErrorHandler } from './create-render-error-handler';

import '../styles/index.css';

const handleRenderError = createRenderErrorHandler(reportError);
const queryErrorHandlers = createQueryErrorHandlers(reportError);

export function App() {
  return (
    <ErrorBoundary FallbackComponent={AppCrashFallback} onError={handleRenderError}>
      <AppProviders
        apiBaseUrl={appConfig.apiBaseUrl}
        notifier={notify}
        queryErrorHandlers={queryErrorHandlers}
      >
        <AppRouterProvider />
      </AppProviders>
    </ErrorBoundary>
  );
}
