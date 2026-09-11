import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SessionResolver } from './session-resolver';
import { useSessionResolver } from './session-resolver-context';
import { SessionResolverProvider } from './session-resolver-provider';

const sessionResolver: SessionResolver = {
  resolve: () => Promise.resolve('unknown'),
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SessionResolverProvider sessionResolver={sessionResolver}>{children}</SessionResolverProvider>
  );
}

describe('SessionResolverProvider', () => {
  it('renders its children', () => {
    render(
      <SessionResolverProvider sessionResolver={sessionResolver}>
        child content
      </SessionResolverProvider>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});

describe('useSessionResolver', () => {
  it('returns the provided resolver', () => {
    const { result } = renderHook(() => useSessionResolver(), { wrapper });

    expect(result.current).toBe(sessionResolver);
  });

  it('fails loudly when no provider is above it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useSessionResolver())).toThrow(
      'useSessionResolver must be called inside a SessionResolverProvider',
    );

    consoleError.mockRestore();
  });
});
