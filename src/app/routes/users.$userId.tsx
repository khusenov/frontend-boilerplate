import { createFileRoute } from '@tanstack/react-router';

import { createUserQueries, toUserId } from '@/entities/user';
import { UserProfilePage } from '@/pages/user-profile';

function UserProfileRoute() {
  const { userId } = Route.useParams();

  return <UserProfilePage userId={toUserId(userId)} />;
}

export const Route = createFileRoute('/users/$userId')({
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      createUserQueries(context.httpClient).detail(toUserId(params.userId)),
    );
  },
  component: UserProfileRoute,
});
