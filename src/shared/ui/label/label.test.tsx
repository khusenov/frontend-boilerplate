import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Label } from './label';

describe('Label', () => {
  it('makes the control reachable by its label text', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <input id="email" type="email" />
      </>,
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('focuses the control when the label is clicked', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <input id="email" type="email" />
      </>,
    );

    await user.click(screen.getByText('Email'));

    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('resolves a caller class against the base class instead of concatenating', () => {
    render(
      <>
        <Label className="text-base" htmlFor="email">
          Email
        </Label>
        <input id="email" type="email" />
      </>,
    );

    const label = screen.getByText('Email');
    expect(label).toHaveClass('text-base');
    expect(label).not.toHaveClass('text-sm');
  });
});
