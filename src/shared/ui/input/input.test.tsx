import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from './input';

describe('Input', () => {
  it('defaults to type text', () => {
    render(<Input aria-label="Search" />);

    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveAttribute('type', 'text');
  });

  it('honours an explicit type', () => {
    render(<Input aria-label="Email" type="email" />);

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('type', 'email');
  });

  it('resolves a caller class against the base class instead of concatenating', () => {
    render(<Input aria-label="Search" className="h-12" />);

    const input = screen.getByRole('textbox', { name: 'Search' });
    expect(input).toHaveClass('h-12');
    expect(input).not.toHaveClass('h-9');
  });

  it('forwards aria-invalid so the destructive ring can apply', () => {
    render(<Input aria-invalid aria-label="Email" />);

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true');
  });
});
