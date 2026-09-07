import type { ReactElement } from 'react';

import type { UserId } from '@/entities/user';
import { UpdateUserNameForm } from '@/features/update-user-name';
import { useTranslation } from '@/shared/i18n';

import { useUserProfile } from '../model/use-user-profile';
import type { UserProfileState } from '../model/use-user-profile';

import { UserProfileView } from './user-profile-view';

interface UserProfilePageProps {
  readonly userId: UserId;
}

interface UserProfileContentProps {
  readonly profile: UserProfileState;
}

function UserProfileContent({ profile }: UserProfileContentProps): ReactElement {
  const { t } = useTranslation();

  switch (profile.status) {
    case 'pending':
      return <output>{t('userProfile.loading')}</output>;
    case 'unavailable':
      return (
        <p role="alert" className="text-destructive">
          {t('userProfile.unavailable')}
        </p>
      );
    case 'ready':
      return (
        <>
          <UserProfileView user={profile.user} />
          <UpdateUserNameForm user={profile.user} />
        </>
      );
  }
}

export function UserProfilePage({ userId }: UserProfilePageProps) {
  const profile = useUserProfile(userId);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <UserProfileContent profile={profile} />
    </main>
  );
}
