import { LOCALES, SUPPORTED_LOCALES, useLocale } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-1">
      {SUPPORTED_LOCALES.map((candidate) => {
        const isActive = candidate === locale;

        return (
          <Button
            key={candidate}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            aria-pressed={isActive}
            lang={candidate}
            onClick={() => {
              setLocale(candidate);
            }}
          >
            {LOCALES[candidate].label}
          </Button>
        );
      })}
    </div>
  );
}
