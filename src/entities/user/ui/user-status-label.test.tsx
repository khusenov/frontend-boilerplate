import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { UserStatus } from '../model/user';

import { UserStatusLabel } from './user-status-label';

const STATUS_LABELS: readonly { readonly status: UserStatus; readonly label: string }[] = [
  { status: 'active', label: 'Active' },
  { status: 'inactive', label: 'Inactive' },
  { status: 'pending', label: 'Awaiting verification' },
];

describe('UserStatusLabel', () => {
  it.each(STATUS_LABELS)(
    'renders the $status status as $label rather than the wire constant',
    ({ status, label }) => {
      render(<UserStatusLabel status={status} />);

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByText(status)).not.toBeInTheDocument();
    },
  );
});
