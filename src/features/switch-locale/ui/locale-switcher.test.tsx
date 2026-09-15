import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { LocaleSwitcher } from './locale-switcher';

describe('LocaleSwitcher', () => {
  it('offers every supported locale under its own name, with the active one pressed', () => {
    render(<LocaleSwitcher />);

    expect(screen.getByRole('button', { name: 'English', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Русский', pressed: false })).toBeInTheDocument();
  });

  it('moves the pressed state when another locale is chosen', async () => {
    const user = userEvent.setup();
    render(<LocaleSwitcher />);

    await user.click(screen.getByRole('button', { name: 'Русский' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Русский', pressed: true })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'English', pressed: false })).toBeInTheDocument();
  });

  it('tags each control with the language it names', () => {
    render(<LocaleSwitcher />);

    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('button', { name: 'Русский' })).toHaveAttribute('lang', 'ru');
  });
});
