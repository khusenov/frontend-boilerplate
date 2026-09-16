import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';

import { UserProfileView } from './user-profile-view';

type ProfileSummary = ComponentProps<typeof UserProfileView>['user'];

const ada: ProfileSummary = {
  displayName: 'Ada Lovelace',
  email: 'ada@example.test',
  status: 'active',
  joinedAt: new Date('2024-01-05T12:00:00.000Z'),
};

describe('UserProfileView', () => {
  it('renders the display name as the heading', () => {
    render(<UserProfileView user={ada} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ada Lovelace');
  });

  it('labels each field with translated copy', () => {
    render(<UserProfileView user={ada} />);

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Joined')).toBeInTheDocument();
  });

  it('shows the email and the translated status', () => {
    render(<UserProfileView user={ada} />);

    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('exposes the join date as a machine readable time element', () => {
    render(<UserProfileView user={ada} />);

    expect(screen.getByText(/2024/)).toHaveAttribute('datetime', '2024-01-05T12:00:00.000Z');
  });
});
