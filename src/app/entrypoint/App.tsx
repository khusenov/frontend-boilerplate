import { appConfig } from '@/shared/config';

import { AppRouterProvider } from '../router/AppRouterProvider';

import { AppProviders } from './AppProviders';

import '../styles/index.css';

export function App() {
  return (
    <AppProviders apiBaseUrl={appConfig.apiBaseUrl}>
      <AppRouterProvider />
    </AppProviders>
  );
}
