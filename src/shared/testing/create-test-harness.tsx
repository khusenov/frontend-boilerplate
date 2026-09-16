import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { HttpClientProvider } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import { createHttpClientStub } from './create-http-client-stub';
import { createTestQueryClient } from './create-test-query-client';

export type ProviderWrapper = ComponentType<{ readonly children: ReactNode }>;

export interface TestHarnessDependencies {
  readonly httpClient?: HttpClient | undefined;
  readonly queryClient?: QueryClient | undefined;
  readonly wrappers?: readonly ProviderWrapper[] | undefined;
}

export interface TestHarnessCollaborators {
  readonly httpClient: HttpClient;
  readonly queryClient: QueryClient;
}

export interface TestHarness extends TestHarnessCollaborators {
  readonly wrapper: ProviderWrapper;
}

interface SplitHarnessOptions<TRest> {
  readonly dependencies: TestHarnessDependencies;
  readonly rest: TRest;
}

export function splitHarnessOptions<TOptions extends TestHarnessDependencies>(
  options: TOptions,
): SplitHarnessOptions<Omit<TOptions, keyof TestHarnessDependencies>> {
  const { httpClient, queryClient, wrappers, ...rest } = options;

  return { dependencies: options, rest };
}

function composeWrappers(wrappers: readonly ProviderWrapper[], children: ReactNode): ReactNode {
  return wrappers.reduceRight<ReactNode>(
    (wrapped, Wrap) => createElement(Wrap, null, wrapped),
    children,
  );
}

export function createTestHarness({
  httpClient = createHttpClientStub(),
  queryClient = createTestQueryClient(),
  wrappers = [],
}: TestHarnessDependencies = {}): TestHarness {
  function TestProviders({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <HttpClientProvider client={httpClient}>
          {composeWrappers(wrappers, children)}
        </HttpClientProvider>
      </QueryClientProvider>
    );
  }

  return { httpClient, queryClient, wrapper: TestProviders };
}
