import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppHeader } from './app-header';

describe('AppHeader', () => {
  it('renders a banner naming the application', () => {
    render(<AppHeader appName="frontend-boilerplate" />);

    expect(screen.getByRole('banner')).toHaveTextContent('frontend-boilerplate');
  });

  it('offers the locale switcher inside the banner', () => {
    render(<AppHeader appName="frontend-boilerplate" />);

    const banner = screen.getByRole('banner');

    expect(within(banner).getByRole('button', { name: 'English' })).toBeInTheDocument();
  });
});
