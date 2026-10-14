import React from 'react';
import ReactDOM from 'react-dom/client';
import PermanentWorld from './permanent/PermanentWorld';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { AdConsentNotice } from './components/AdConsent';
import {
  HttpWorldGateway,
  LocalWorldRepository,
  RemoteWorldRepository,
  WorldRepositoryProvider,
} from './repositories';
import './index.css';
import './enhancements.css';
import { isPolicyPage, PolicyPage } from './Policies';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      console.info('Offline shell unavailable; the online canvas is still available.');
    });
  });
}

const repository =
  import.meta.env.VITE_WORLD_MODE === 'remote'
    ? new RemoteWorldRepository(
        new HttpWorldGateway({
          baseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
          token: import.meta.env.DEV ? import.meta.env.VITE_DEV_AUTH_TOKEN || '' : '',
        }),
      )
    : new LocalWorldRepository();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorldRepositoryProvider repository={repository}>
      <ErrorBoundary>
        {!isPolicyPage(location.pathname) && <AdConsentNotice />}
        {isPolicyPage(location.pathname) ? <PolicyPage /> : <PermanentWorld />}
      </ErrorBoundary>
    </WorldRepositoryProvider>
  </React.StrictMode>,
);
