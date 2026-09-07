import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { toUserId } from '@/entities/user';
import type { User } from '@/entities/user';

import { UserProfileView } from './user-profile-view';

const ada: User = {
  id: toUserId('u_1'),
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: 'Ada Lovelace',
  email: 'ada@example.test',
  role: 'admin',
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
    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
  });

  it('renders the role label rather than the wire constant', () => {
    render(<UserProfileView user={ada} />);

    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN')).not.toBeInTheDocument();
  });

  it('exposes the join date as a machine readable time element', () => {
    render(<UserProfileView user={ada} />);

    const joinedAt = document.querySelector('time');

    expect(joinedAt).toHaveAttribute('datetime', '2024-01-05T12:00:00.000Z');
    expect(joinedAt).toHaveTextContent('2024');
  });
});
