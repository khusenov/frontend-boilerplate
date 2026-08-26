import { createFileRoute } from '@tanstack/react-router';

import { HomePage } from '@/pages/home';
import { appConfig } from '@/shared/config';

function HomeRoute() {
  return <HomePage name={appConfig.name} mode={appConfig.mode} apiBaseUrl={appConfig.apiBaseUrl} />;
}

export const Route = createFileRoute('/')({
  component: HomeRoute,
});
