import { render } from 'preact';
import { App } from './components/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/reset.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/components.css';

const root = document.getElementById('app');
if (root) {
  root.innerHTML = '';
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
    root
  );
}

// Register the PWA service worker (production only; it is a no-op in dev)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      // Check for a new deploy every hour so long-open tabs pick up data updates
      registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
          if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
        }
      });
    })
    .catch(() => {
      // PWA registration is optional — the app works without it
    });
}
