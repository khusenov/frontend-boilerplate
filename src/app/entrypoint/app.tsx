import { appConfig } from '@/shared/config';

import { AppRouterProvider } from '../router/app-router-provider';

import { AppProviders } from './app-providers';

import '../styles/index.css';

export function App() {
  return (
    <AppProviders apiBaseUrl={appConfig.apiBaseUrl}>
      <AppRouterProvider />
    </AppProviders>
  );
}
