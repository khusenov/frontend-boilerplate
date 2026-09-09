import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SessionStarter } from './session-starter';
import { useSessionStarter } from './session-starter-context';
import { SessionStarterProvider } from './session-starter-provider';

const sessionStarter: SessionStarter = {
  signIn: () => Promise.resolve({ status: 'unavailable' }),
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SessionStarterProvider sessionStarter={sessionStarter}>{children}</SessionStarterProvider>
  );
}

describe('SessionStarterProvider', () => {
  it('renders its children', () => {
    render(
      <SessionStarterProvider sessionStarter={sessionStarter}>
        child content
      </SessionStarterProvider>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});

describe('useSessionStarter', () => {
  it('returns the provided starter', () => {
    const { result } = renderHook(() => useSessionStarter(), { wrapper });

    expect(result.current).toBe(sessionStarter);
  });

  it('fails loudly when no provider is above it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useSessionStarter())).toThrow(
      'useSessionStarter must be called inside a SessionStarterProvider',
    );

    consoleError.mockRestore();
  });
});
