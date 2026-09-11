import { createFileRoute, redirect } from '@tanstack/react-router';

import { ResolvingSessionPage } from '@/pages/resolving-session';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    if ((await context.sessionResolver.resolve()) !== 'authenticated') {
      redirect({ to: '/sign-in', throw: true });
    }
  },
  pendingComponent: ResolvingSessionPage,
});
