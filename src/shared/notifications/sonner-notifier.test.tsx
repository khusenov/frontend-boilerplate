import { act, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it } from 'vitest';

import { NotificationViewport } from './notification-viewport';
import { createSonnerNotifier } from './sonner-notifier';

// sonner's store is a module-level singleton that replays every still-active toast to each new
// subscriber, and RTL cleanup() unmounts the viewport without dismissing them.
afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

function renderViewport() {
  render(<NotificationViewport />);

  return createSonnerNotifier();
}

describe('createSonnerNotifier', () => {
  it('renders the message into the mounted viewport', async () => {
    const notify = renderViewport();

    act(() => {
      notify({ message: 'Name updated.' });
    });

    expect(await screen.findByText('Name updated.')).toBeInTheDocument();
  });

  it('renders the newest message when notified twice', async () => {
    const notify = renderViewport();

    act(() => {
      notify({ message: 'Name updated.' });
      notify({ message: 'Name updated again.' });
    });

    expect(await screen.findByText('Name updated again.')).toBeInTheDocument();
    expect(screen.getByText('Name updated.')).toBeInTheDocument();
  });
});
