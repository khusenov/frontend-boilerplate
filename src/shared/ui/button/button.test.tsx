import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders a button with its accessible name', () => {
    render(<Button>Add one second</Button>);

    expect(screen.getByRole('button', { name: 'Add one second' })).toBeInTheDocument();
  });

  it('defaults to type button so it never submits an enclosing form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Button>Add</Button>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('honours an explicit type', () => {
    render(<Button type="submit">Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
  });

  it('resolves a caller class against the variant class instead of concatenating', () => {
    render(<Button className="px-8">Go</Button>);

    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveClass('px-8');
    expect(button).not.toHaveClass('px-4');
  });

  it('exposes the resolved variant and size as styling hooks', () => {
    render(<Button>Default</Button>);

    const button = screen.getByRole('button', { name: 'Default' });
    expect(button).toHaveAttribute('data-variant', 'default');
    expect(button).toHaveAttribute('data-size', 'default');
  });

  it('keeps the data attribute and the emitted classes in agreement', () => {
    render(<Button variant="secondary">Secondary</Button>);

    const button = screen.getByRole('button', { name: 'Secondary' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveClass('bg-secondary');
  });

  it('calls the click handler when activated', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Submit</Button>);

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call the click handler while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Submit
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders the child element instead of a button when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/docs">Docs</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('href', '/docs');
    expect(link).not.toHaveAttribute('type');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
