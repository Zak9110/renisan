import { Component, type ComponentChildren } from 'preact';
import { getLanguage } from '../lib/i18n';

// Hardcoded on purpose: this must render even if translations failed to load.
const MESSAGES = {
  ar: { title: 'حدث خطأ غير متوقع', action: 'إعادة تحميل التطبيق' },
  ckb: { title: 'هەڵەیەکی چاوەڕواننەکراو ڕوویدا', action: 'دووبارە بارکردنەوەی بەرنامە' },
  kmr: { title: 'Çewtiyek neçaverêkirî çêbû', action: 'Sepanê ji nû ve bar bike' }
} as const;

interface State {
  error: unknown;
}

/** Catches render errors so a single bug shows a recoverable screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ComponentChildren }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error('[Renisan] Unhandled render error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = MESSAGES[getLanguage()] ?? MESSAGES.ckb;
    return (
      <div class="app-container">
        <div class="empty-state" role="alert" style={{ marginTop: 'var(--space-10)' }}>
          <span class="empty-state__icon" aria-hidden="true">⚠️</span>
          <h1 class="empty-state__title">{msg.title}</h1>
          <button type="button" class="pill-btn empty-state__action" onClick={() => window.location.reload()}>
            {msg.action}
          </button>
        </div>
      </div>
    );
  }
}
