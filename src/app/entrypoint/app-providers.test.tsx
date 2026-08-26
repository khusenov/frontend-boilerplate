import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { HttpClient } from '@/shared/api';
import { useHttpClient } from '@/shared/api';

import { AppProviders } from './app-providers';

describe('AppProviders', () => {
  it('renders its children', () => {
    render(
      <AppProviders apiBaseUrl="/api">
        <p>child content</p>
      </AppProviders>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('provides the configured query client and a usable http client', () => {
    const captured: { httpClient: HttpClient | null; staleTime: unknown } = {
      httpClient: null,
      staleTime: null,
    };

    function ClientProbe() {
      captured.httpClient = useHttpClient();
      captured.staleTime = useQueryClient().getDefaultOptions().queries?.staleTime;

      return null;
    }

    render(
      <AppProviders apiBaseUrl="/api">
        <ClientProbe />
      </AppProviders>,
    );

    expect(typeof captured.httpClient?.get).toBe('function');
    expect(captured.staleTime).toBe(30_000);
  });

  it('keeps one http client instance across re-renders', () => {
    const seen: HttpClient[] = [];

    function IdentityProbe() {
      seen.push(useHttpClient());

      return null;
    }

    const renderTree = () => (
      <AppProviders apiBaseUrl="/api">
        <IdentityProbe />
      </AppProviders>
    );
    const { rerender } = render(renderTree());
    rerender(renderTree());

    expect(seen).toHaveLength(2);
    expect(new Set(seen).size).toBe(1);
  });
});
