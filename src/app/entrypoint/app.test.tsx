import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';

describe('App', () => {
  afterEach(() => {
    vi.doUnmock('./app-providers');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders the home page', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'frontend-boilerplate' }),
    ).toBeInTheDocument();
  });

  it('renders on a cold load in a non-default locale', async () => {
    localStorage.setItem('app.locale', 'ru');

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Добавить секунду' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('ru');
    });
  });

  it('catches a provider construction failure instead of unmounting the tree', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock('./app-providers', () => ({
      AppProviders: () => {
        throw new Error('provider construction failed');
      },
    }));
    vi.resetModules();

    const { App: AppWithFailingProviders } = await import('./app');
    render(<AppWithFailingProviders />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeInTheDocument();
  });
});
