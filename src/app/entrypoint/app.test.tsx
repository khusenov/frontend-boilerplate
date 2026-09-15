import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders the application header with the configured name', async () => {
    render(<App />);

    expect(await screen.findByRole('banner')).toHaveTextContent('frontend-boilerplate');
  });

  it('switches the application language from the app-shell header', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Русский' }));

    expect(await screen.findByRole('button', { name: 'Добавить секунду' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('ru');
    });
  });

  it('catches a provider construction failure instead of unmounting the tree', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
    expect(consoleError).toHaveBeenCalledWith(
      'error reported from render',
      expect.any(Error),
      expect.any(String),
    );
  });
});
