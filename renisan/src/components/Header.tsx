import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import type { Language } from '../lib/i18n';
import { LANG_CONFIG } from '../lib/i18n';

interface HeaderProps {
  isOfflineReady: boolean;
}

export function Header({ isOfflineReady }: HeaderProps) {
  const { lang, t, switchLanguage } = useI18n();
  const { pref, resolved, cycle } = useTheme();
  const languages: Language[] = ['ckb', 'ar', 'kmr'];

  const themeName = pref === 'system' ? t('themeSystem') : pref === 'dark' ? t('themeDark') : t('themeLight');

  return (
    <header class="header" role="banner">
      <div class="header__inner">
        <div class="header__brand">
          <div class="header__logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="32" height="32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="url(#logo-grad)" stroke-width="2.5" />
              <path d="M6.5 13.5 16 9l9.5 4.5L16 18z" fill="url(#logo-grad)" />
              <path d="M10.5 15.8v4.2c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3v-4.2" stroke="url(#logo-grad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M25.5 13.5v5" stroke="url(#logo-grad)" stroke-width="1.8" stroke-linecap="round" />
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

          <button
            type="button"
            class="theme-toggle"
            onClick={cycle}
            aria-label={`${t('themeLabel')}: ${themeName}`}
            title={`${t('themeLabel')}: ${themeName}`}
          >
            <span class="theme-toggle__icon" aria-hidden="true">
              {pref === 'system' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="4" width="20" height="14" rx="2" /><path d="M8 21h8M12 18v3" />
                </svg>
              ) : resolved === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              )}
            </span>
            <span>{themeName}</span>
          </button>

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
