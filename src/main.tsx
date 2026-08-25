import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app';

const ROOT_ELEMENT_ID = 'root';

const rootElement = document.getElementById(ROOT_ELEMENT_ID);

if (!rootElement) {
  throw new Error(`Root element #${ROOT_ELEMENT_ID} was not found in index.html`);
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
