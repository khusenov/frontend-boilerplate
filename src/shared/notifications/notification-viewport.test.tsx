import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, describe, expect, it } from 'vitest';

import { useLocale } from '@/shared/i18n';

import { NotificationViewport } from './notification-viewport';

// sonner's store is a module-level singleton that replays every still-active toast to each new
// subscriber, and RTL cleanup() unmounts the viewport without dismissing them.
afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

function RussianLocaleControl() {
  const { setLocale } = useLocale();

  return (
    <button
      onClick={() => {
        setLocale('ru');
      }}
      type="button"
    >
      switch to russian
    </button>
  );
}

describe('NotificationViewport', () => {
  it('names the toast region with the translated label', () => {
    render(<NotificationViewport />);

    expect(screen.getByRole('region')).toHaveAccessibleName('Notifications alt+T');
  });

  it('names the close button with the translated label', async () => {
    render(<NotificationViewport />);

    act(() => {
      toast.success('Name updated.');
    });

    expect(await screen.findByRole('button', { name: 'Close toast' })).toBeInTheDocument();
  });

  it('renames the region and the close button when the locale changes', async () => {
    const user = userEvent.setup();
    render(
      <>
        <RussianLocaleControl />
        <NotificationViewport />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'switch to russian' }));

    await waitFor(() => {
      expect(screen.getByRole('region')).toHaveAccessibleName('Уведомления alt+T');
    });

    act(() => {
      toast.success('Имя обновлено.');
    });

    expect(await screen.findByRole('button', { name: 'Закрыть уведомление' })).toBeInTheDocument();
  });
});
