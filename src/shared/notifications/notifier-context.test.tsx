import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Notifier } from './notifier';
import { useNotifier } from './notifier-context';
import { NotifierProvider } from './notifier-provider';

function wrapperFor(notifier: Notifier) {
  return function NotifierWrapper({ children }: { children: ReactNode }) {
    return <NotifierProvider notifier={notifier}>{children}</NotifierProvider>;
  };
}

describe('NotifierProvider', () => {
  it('renders its children', () => {
    render(<NotifierProvider notifier={() => undefined}>child content</NotifierProvider>);

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('swallows a throwing notifier instead of letting it reach the consumer', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const notifierFailure = new Error('the toast host is broken');
    const { result } = renderHook(() => useNotifier(), {
      wrapper: wrapperFor(() => {
        throw notifierFailure;
      }),
    });

    expect(() => {
      result.current({ message: 'Name updated.' });
    }).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith('the notifier failed', notifierFailure);

    consoleError.mockRestore();
  });
});

describe('useNotifier', () => {
  it('delivers to the notifier the nearest provider supplies', () => {
    const notify = vi.fn();
    const { result } = renderHook(() => useNotifier(), { wrapper: wrapperFor(notify) });

    result.current({ message: 'Name updated.' });

    expect(notify).toHaveBeenCalledWith({ message: 'Name updated.' });
  });

  it('resolves to the innermost provider when two are nested', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const { result } = renderHook(() => useNotifier(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <NotifierProvider notifier={outer}>
          <NotifierProvider notifier={inner}>{children}</NotifierProvider>
        </NotifierProvider>
      ),
    });

    result.current({ message: 'Name updated.' });

    expect(inner).toHaveBeenCalledWith({ message: 'Name updated.' });
    expect(outer).not.toHaveBeenCalled();
  });

  it('fails loudly when no provider is above it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useNotifier())).toThrow(
      'useNotifier must be called inside a NotifierProvider',
    );

    consoleError.mockRestore();
  });
});
