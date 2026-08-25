import { HomePage } from '@/pages/home';
import { appConfig } from '@/shared/config';

import '../styles/index.css';

export function App() {
  return <HomePage name={appConfig.name} mode={appConfig.mode} apiBaseUrl={appConfig.apiBaseUrl} />;
}
