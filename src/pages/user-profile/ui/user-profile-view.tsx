import { useMemo } from 'react';

import { UserStatusLabel } from '@/entities/user';
import type { User } from '@/entities/user';
import { useLocale, useTranslation } from '@/shared/i18n';

interface UserProfileViewProps {
  readonly user: Pick<User, 'displayName' | 'email' | 'joinedAt' | 'status'>;
}

export function UserProfileView({ user }: UserProfileViewProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'long' }),
    [locale],
  );

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{user.displayName}</h1>
      <dl className="space-y-2 text-sm">
        <div className="flex gap-6">
          <dt className="w-32 text-muted-foreground">{t('user.email')}</dt>
          <dd>{user.email}</dd>
        </div>
        <div className="flex gap-6">
          <dt className="w-32 text-muted-foreground">{t('user.status')}</dt>
          <dd>
            <UserStatusLabel status={user.status} />
          </dd>
        </div>
        <div className="flex gap-6">
          <dt className="w-32 text-muted-foreground">{t('user.joinedAt')}</dt>
          <dd>
            <time dateTime={user.joinedAt.toISOString()}>
              {dateFormatter.format(user.joinedAt)}
            </time>
          </dd>
        </div>
      </dl>
    </>
  );
}
