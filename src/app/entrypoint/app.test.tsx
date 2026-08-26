import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './app';

describe('App', () => {
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
});
