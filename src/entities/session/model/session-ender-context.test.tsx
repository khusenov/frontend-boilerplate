import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SessionEnder } from './session-ender';
import { useSessionEnder } from './session-ender-context';
import { SessionEnderProvider } from './session-ender-provider';

const sessionEnder: SessionEnder = {
  signOut: () => Promise.resolve({ status: 'unavailable' }),
};

function wrapper({ children }: { children: ReactNode }) {
  return <SessionEnderProvider sessionEnder={sessionEnder}>{children}</SessionEnderProvider>;
}

describe('SessionEnderProvider', () => {
  it('renders its children', () => {
    render(<SessionEnderProvider sessionEnder={sessionEnder}>child content</SessionEnderProvider>);

    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});

describe('useSessionEnder', () => {
  it('returns the provided ender', () => {
    const { result } = renderHook(() => useSessionEnder(), { wrapper });

    expect(result.current).toBe(sessionEnder);
  });

  it('fails loudly when no provider is above it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useSessionEnder())).toThrow(
      'useSessionEnder must be called inside a SessionEnderProvider',
    );

    consoleError.mockRestore();
  });
});
