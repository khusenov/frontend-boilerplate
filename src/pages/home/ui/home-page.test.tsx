import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { HomePage } from './home-page';

describe('HomePage', () => {
  it('renders the application name as the heading', () => {
    render(<HomePage name="frontend-boilerplate" mode="test" apiBaseUrl="/api" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('frontend-boilerplate');
  });

  it('renders the mode and api base url it is given', () => {
    render(<HomePage name="frontend-boilerplate" mode="test" apiBaseUrl="/api" />);

    const environment = screen.getByText(/mode:/);
    expect(environment).toHaveTextContent('mode: test');
    expect(environment).toHaveTextContent('api: /api');
  });

  it('renders whichever api base url it is given', () => {
    render(
      <HomePage
        name="frontend-boilerplate"
        mode="production"
        apiBaseUrl="https://api.example.test"
      />,
    );

    const environment = screen.getByText(/mode:/);
    expect(environment).toHaveTextContent('mode: production');
    expect(environment).toHaveTextContent('api: https://api.example.test');
  });

  it('starts the elapsed status region at zero', () => {
    render(<HomePage name="frontend-boilerplate" mode="test" apiBaseUrl="/api" />);

    expect(screen.getByRole('status')).toHaveTextContent('00:00');
  });

  it('advances the elapsed status region by one second per click', async () => {
    const user = userEvent.setup();
    render(<HomePage name="frontend-boilerplate" mode="test" apiBaseUrl="/api" />);

    await user.click(screen.getByRole('button', { name: 'Add one second' }));

    expect(screen.getByRole('status')).toHaveTextContent('00:01');
  });
});
