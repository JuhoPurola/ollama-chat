import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

interface Config {
  apiUrls: Record<string, string>;
  auth0: { domain: string; clientId: string; audience: string };
}

// Fetch config then render
fetch('/config.json')
  .then(r => r.json())
  .then((config: Config) => {
    // Store config globally
    (window as any).__CONFIG__ = config;

    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <Auth0Provider
          domain={config.auth0.domain}
          clientId={config.auth0.clientId}
          authorizationParams={{
            redirect_uri: window.location.origin,
            audience: config.auth0.audience,
            scope: 'openid profile email',
          }}
        >
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </Auth0Provider>
      </React.StrictMode>
    );
  })
  .catch(err => {
    document.getElementById('root')!.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #111827; color: #f9fafb; font-family: system-ui;">
        <div style="text-align: center;">
          <h1 style="font-size: 24px; margin-bottom: 8px;">Configuration Error</h1>
          <p style="color: #9ca3af;">Failed to load config.json: ${err.message}</p>
        </div>
      </div>
    `;
  });
