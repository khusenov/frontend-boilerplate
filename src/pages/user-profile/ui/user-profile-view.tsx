import { useMemo } from 'react';

import type { User, UserRole } from '@/entities/user';
import { useLocale, useTranslation } from '@/shared/i18n';

const ROLE_LABEL_KEYS = {
  admin: 'user.roles.admin',
  member: 'user.roles.member',
  viewer: 'user.roles.viewer',
} as const satisfies Record<UserRole, string>;

interface UserProfileViewProps {
  readonly user: User;
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
          <dt className="w-32 text-muted-foreground">{t('user.role')}</dt>
          <dd>{t(ROLE_LABEL_KEYS[user.role])}</dd>
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
