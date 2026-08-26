import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createHttpClient } from './http-client';
import { useHttpClient } from './http-client-context';
import { HttpClientProvider } from './HttpClientProvider';

const client = createHttpClient({ baseUrl: '/api' });

function wrapper({ children }: { children: ReactNode }) {
  return <HttpClientProvider client={client}>{children}</HttpClientProvider>;
}

describe('HttpClientProvider', () => {
  it('renders its children', () => {
    render(<HttpClientProvider client={client}>child content</HttpClientProvider>);

    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});

describe('useHttpClient', () => {
  it('returns the provided client', () => {
    const { result } = renderHook(() => useHttpClient(), { wrapper });

    expect(result.current).toBe(client);
  });

  it('fails loudly when no provider is above it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useHttpClient())).toThrow(
      'useHttpClient must be called inside an HttpClientProvider',
    );

    consoleError.mockRestore();
  });
});
