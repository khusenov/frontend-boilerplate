import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { createUserQueries, toUserId } from '@/entities/user';
import { UserProfilePage } from '@/pages/user-profile';

function UserProfileRoute() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <UserProfilePage
      userId={toUserId(userId)}
      onSignedOut={() => {
        void navigate({ to: '/sign-in' });
      }}
    />
  );
}

export const Route = createFileRoute('/_authenticated/users/$userId')({
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      createUserQueries(context.httpClient).detail(toUserId(params.userId)),
    );
  },
  component: UserProfileRoute,
});
