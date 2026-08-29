import { appConfig } from '@/shared/config';
import { ErrorBoundary } from '@/shared/ui/error-boundary';

import { AppRouterProvider } from '../router/app-router-provider';

import { AppCrashFallback } from './app-crash-fallback';
import { AppProviders } from './app-providers';

import '../styles/index.css';

export function App() {
  return (
    <ErrorBoundary FallbackComponent={AppCrashFallback}>
      <AppProviders apiBaseUrl={appConfig.apiBaseUrl}>
        <AppRouterProvider />
      </AppProviders>
    </ErrorBoundary>
  );
}
