import type { CSSProperties } from 'react';
import { Toaster } from 'sonner';

import { useTranslation } from '@/shared/i18n';

const TOAST_POSITION = 'bottom-right';
const TOAST_DURATION_MS = 6000;

// --gray2 and --gray5 are declared only on sonner's base rule, never redefined per theme, so the
// close button's hover state would stay near-white under the .dark class without these two.
const TOAST_THEME_TOKENS = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--gray2': 'var(--accent)',
  '--gray5': 'var(--border)',
} as CSSProperties;

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-ring';

export function NotificationViewport() {
  const { t } = useTranslation();

  return (
    <Toaster
      closeButton
      containerAriaLabel={t('notifications.regionLabel')}
      duration={TOAST_DURATION_MS}
      position={TOAST_POSITION}
      style={TOAST_THEME_TOKENS}
      toastOptions={{
        classNames: { toast: FOCUS_RING, closeButton: FOCUS_RING },
        closeButtonAriaLabel: t('notifications.close'),
      }}
    />
  );
}
