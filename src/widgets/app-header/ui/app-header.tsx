import { LocaleSwitcher } from '@/features/switch-locale';

interface AppHeaderProps {
  readonly appName: string;
}

export function AppHeader({ appName }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-8 py-4">
      <span className="text-sm font-semibold tracking-tight">{appName}</span>
      <LocaleSwitcher />
    </header>
  );
}
