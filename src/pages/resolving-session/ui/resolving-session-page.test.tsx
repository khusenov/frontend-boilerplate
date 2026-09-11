import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResolvingSessionPage } from './resolving-session-page';

describe('ResolvingSessionPage', () => {
  it('names the check the visitor is waiting on', () => {
    render(<ResolvingSessionPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Checking your session…');
  });
});
