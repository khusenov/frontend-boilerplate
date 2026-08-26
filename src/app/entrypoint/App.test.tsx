import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the home page', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'frontend-boilerplate' }),
    ).toBeInTheDocument();
  });
});
