import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useHttpClient } from '@/shared/api';

import { createHttpClientStub } from './create-http-client-stub';
import { createTestQueryClient } from './create-test-query-client';
import { renderHookWithProviders, renderWithProviders } from './render-with-providers';

const LabelContext = createContext('unwrapped');

function Label() {
  return <p>{use(LabelContext)}</p>;
}

function labelWrapper(value: string) {
  return function LabelWrapper({ children }: { readonly children: ReactNode }) {
    return <LabelContext value={value}>{children}</LabelContext>;
  };
}

function Greeting({ label }: { readonly label: string }) {
  const { data } = useQuery({
    queryKey: [label],
    queryFn: () => Promise.resolve(label),
  });

  return <p>{data ?? 'loading'}</p>;
}

describe('renderWithProviders', () => {
  it('provides a query client so a query-consuming component can render', async () => {
    renderWithProviders(<Greeting label="hello" />);

    expect(await screen.findByText('hello')).toBeInTheDocument();
  });

  it('provides the http client stub by default and returns it', () => {
    const { httpClient } = renderWithProviders(<p>rendered</p>);

    expect(httpClient).toBeDefined();
    expect(screen.getByText('rendered')).toBeInTheDocument();
  });

  it('uses the http client the caller supplies', () => {
    const httpClient = createHttpClientStub();

    function Probe() {
      return <p>{useHttpClient() === httpClient ? 'same client' : 'different client'}</p>;
    }

    renderWithProviders(<Probe />, { httpClient });

    expect(screen.getByText('same client')).toBeInTheDocument();
  });

  it('uses the query client the caller supplies', () => {
    const queryClient = createTestQueryClient();

    const result = renderWithProviders(<p>rendered</p>, { queryClient });

    expect(result.queryClient).toBe(queryClient);
  });

  it('applies caller-supplied wrappers around the subject', () => {
    renderWithProviders(<Label />, { wrappers: [labelWrapper('wrapped')] });

    expect(screen.getByText('wrapped')).toBeInTheDocument();
  });

  it('nests wrappers so the first one listed is outermost', () => {
    renderWithProviders(<Label />, {
      wrappers: [labelWrapper('outer'), labelWrapper('inner')],
    });

    expect(screen.getByText('inner')).toBeInTheDocument();
  });

  it('keeps the providers in place across a rerender', async () => {
    const { rerender } = renderWithProviders(<Greeting label="first" />);

    expect(await screen.findByText('first')).toBeInTheDocument();

    rerender(<Greeting label="second" />);

    expect(await screen.findByText('second')).toBeInTheDocument();
  });

  it('returns a user-event instance ready to drive the subject', async () => {
    const { user } = renderWithProviders(<button type="button">press me</button>);

    await user.click(screen.getByRole('button', { name: 'press me' }));

    expect(screen.getByRole('button', { name: 'press me' })).toBeInTheDocument();
  });

  it('forwards user-event options to setup', async () => {
    const onMouseOver = vi.fn();

    const { user } = renderWithProviders(
      <button type="button" onFocus={() => undefined} onMouseOver={onMouseOver}>
        press me
      </button>,
      { userEventOptions: { skipHover: true } },
    );

    await user.click(screen.getByRole('button', { name: 'press me' }));

    expect(onMouseOver).not.toHaveBeenCalled();
  });
});

describe('renderHookWithProviders', () => {
  it('provides the query client to the hook under test', async () => {
    const { result } = renderHookWithProviders(() =>
      useQuery({ queryKey: ['hook'], queryFn: () => Promise.resolve('hooked') }),
    );

    await expect.poll(() => result.current.data).toBe('hooked');
  });

  it('applies caller-supplied wrappers to the hook under test', () => {
    const { result } = renderHookWithProviders(() => use(LabelContext), {
      wrappers: [labelWrapper('wrapped hook')],
    });

    expect(result.current).toBe('wrapped hook');
  });

  it('returns the resolved http client', () => {
    const httpClient = createHttpClientStub();

    const { result, ...collaborators } = renderHookWithProviders(() => useHttpClient(), {
      httpClient,
    });

    expect(collaborators.httpClient).toBe(httpClient);
    expect(result.current).toBe(httpClient);
  });
});
