import { useI18n } from '../hooks/useI18n';
import type { Language } from '../lib/i18n';
import { LANG_CONFIG } from '../lib/i18n';

interface HeaderProps {
  isOfflineReady: boolean;
}

export function Header({ isOfflineReady }: HeaderProps) {
  const { lang, t, switchLanguage } = useI18n();
  const languages: Language[] = ['ckb', 'ar', 'kmr'];

  return (
    <header class="header" role="banner">
      <div class="header__inner">
        <div class="header__brand">
          <div class="header__logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="32" height="32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="url(#logo-grad)" stroke-width="2.5" />
              <path d="M10 20l3-8h2l3 8M11.5 16h5M22 12v8" stroke="url(#logo-grad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <defs>
                <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32">
                  <stop offset="0%" stop-color="#f59e0b" />
                  <stop offset="100%" stop-color="#f97316" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 class="header__title">
            <span class="text-gradient">{t('appName')}</span>
          </h1>
        </div>

        <div class="header__controls">
          {isOfflineReady && (
            <div class="offline-badge" title={t('offlineReady')}>
              <span class="offline-badge__dot" />
              <span class="offline-badge__text">{t('offlineIndicator')}</span>
            </div>
          )}

          <div class="lang-switcher" role="radiogroup" aria-label="Language">
            {languages.map((l) => (
              <button
                key={l}
                class={`lang-switcher__btn ${lang === l ? 'lang-switcher__btn--active' : ''}`}
                role="radio"
                aria-checked={lang === l}
                onClick={() => switchLanguage(l)}
                dir={LANG_CONFIG[l].dir}
              >
                {LANG_CONFIG[l].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
