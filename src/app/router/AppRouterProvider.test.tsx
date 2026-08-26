import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HttpClientProvider, toHttpError } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import { AppRouterProvider } from './AppRouterProvider';
import { createAppRouter } from './create-app-router';

vi.mock(import('./create-app-router'), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, createAppRouter: vi.fn(actual.createAppRouter) };
});

const notCalled = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('The router tests perform no HTTP calls.')));

const httpClient: HttpClient = {
  get: notCalled,
  post: notCalled,
  put: notCalled,
  patch: notCalled,
  delete: notCalled,
};

describe('AppRouterProvider', () => {
  it('creates the router once across re-renders', async () => {
    const queryClient = new QueryClient();

    function Harness() {
      return (
        <QueryClientProvider client={queryClient}>
          <HttpClientProvider client={httpClient}>
            <AppRouterProvider />
          </HttpClientProvider>
        </QueryClientProvider>
      );
    }

    const { rerender } = render(<Harness />);
    await screen.findByRole('heading', { level: 1, name: 'frontend-boilerplate' });

    rerender(<Harness />);

    expect(vi.mocked(createAppRouter)).toHaveBeenCalledTimes(1);
  });
});
