import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import {
  SessionEnderProvider,
  SessionResolverProvider,
  SessionStarterProvider,
} from '@/entities/session';
import { createQueryClient, HttpClientProvider } from '@/shared/api';
import { createI18n, I18nProvider } from '@/shared/i18n';
import { NotificationViewport, NotifierProvider } from '@/shared/notifications';
import type { Notifier } from '@/shared/notifications';
import {
  createBrowserThemeStorage,
  createDocumentThemeApplier,
  createSystemThemeSource,
  createThemeController,
  ThemeProvider,
} from '@/shared/theme';

import { clearCacheOnSessionEnd } from './clear-cache-on-session-end';
import { createAuthenticatedTransport } from './create-authenticated-transport';
import type { QueryErrorHandlers } from './create-query-error-handlers';

interface AppProvidersProps {
  readonly apiBaseUrl: string;
  readonly notifier: Notifier;
  readonly queryErrorHandlers: QueryErrorHandlers;
  readonly children: ReactNode;
}

export function AppProviders({
  apiBaseUrl,
  notifier,
  queryErrorHandlers,
  children,
}: AppProvidersProps) {
  const [transport] = useState(() => createAuthenticatedTransport(apiBaseUrl));
  const [queryClient] = useState(() => createQueryClient(queryErrorHandlers));
  const [i18n] = useState(() => createI18n());
  const [themeController] = useState(() =>
    createThemeController({
      storage: createBrowserThemeStorage(),
      systemTheme: createSystemThemeSource(),
    }),
  );
  const [applyTheme] = useState(() => createDocumentThemeApplier());

  useEffect(
    () => clearCacheOnSessionEnd(transport.sessionObserver, queryClient),
    [transport, queryClient],
  );

  return (
    <ThemeProvider controller={themeController} applyTheme={applyTheme}>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <I18nProvider i18n={i18n}>
            <NotificationViewport />
            <HttpClientProvider client={transport.httpClient}>
              <SessionResolverProvider sessionResolver={transport.sessionResolver}>
                <SessionStarterProvider sessionStarter={transport.sessionStarter}>
                  <SessionEnderProvider sessionEnder={transport.sessionEnder}>
                    <NotifierProvider notifier={notifier}>{children}</NotifierProvider>
                  </SessionEnderProvider>
                </SessionStarterProvider>
              </SessionResolverProvider>
            </HttpClientProvider>
          </I18nProvider>
        </Suspense>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
