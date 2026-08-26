import { HomePage } from '@/pages/home';
import { appConfig } from '@/shared/config';

import { AppProviders } from './AppProviders';

import '../styles/index.css';

export function App() {
  return (
    <AppProviders apiBaseUrl={appConfig.apiBaseUrl}>
      <HomePage name={appConfig.name} mode={appConfig.mode} apiBaseUrl={appConfig.apiBaseUrl} />
    </AppProviders>
  );
}
