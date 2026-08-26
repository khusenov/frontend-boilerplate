import { act, renderHook, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { i18n as I18nInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { createI18n } from './create-i18n';
import { DEFAULT_LOCALE } from './registry';
import { useLocale } from './use-locale';

const withoutDetection = { order: [], caches: [] };

function renderUseLocale(i18n: I18nInstance) {
  return renderHook(() => useLocale(), {
    wrapper: ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>,
  });
}

describe('useLocale', () => {
  it('returns the active locale and its text direction', () => {
    const { result } = renderUseLocale(createI18n({ locale: 'ru', detection: withoutDetection }));

    expect(result.current.locale).toBe('ru');
    expect(result.current.dir).toBe('ltr');
  });

  it('re-renders with the new value after setLocale', async () => {
    const { result } = renderUseLocale(
      createI18n({ locale: DEFAULT_LOCALE, detection: withoutDetection }),
    );

    act(() => {
      result.current.setLocale('ru');
    });

    await waitFor(() => {
      expect(result.current.locale).toBe('ru');
    });
  });

  it('falls back to the default locale before the instance has resolved a language', () => {
    const { result } = renderUseLocale(createInstance());

    expect(result.current.locale).toBe(DEFAULT_LOCALE);
    expect(result.current.dir).toBe('ltr');
  });
});
