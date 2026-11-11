import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RoutePendingPage } from './route-pending-page';

describe('RoutePendingPage', () => {
  it('shows the loading message as a status inside the page landmark, without a heading', () => {
    render(<RoutePendingPage />);

    expect(screen.getByRole('main')).toContainElement(screen.getByRole('status'));
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
