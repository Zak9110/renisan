import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { BrandMark } from './BrandMark';
import type { Language } from '../lib/i18n';
import { LANG_CONFIG, LANGUAGES } from '../lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface HeaderProps {
  isOfflineReady: boolean;
}

export function Header({ isOfflineReady }: HeaderProps) {
  const { lang, t, switchLanguage } = useI18n();
  const { pref, resolved, cycle } = useTheme();
  const languages: Language[] = LANGUAGES;
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const themeName = pref === 'system' ? t('themeSystem') : pref === 'dark' ? t('themeDark') : t('themeLight');

  return (
    <header class="header" role="banner">
      <div class="header__inner">
        <a class="header__brand" href="/" aria-label={t('appName')}>
          <span class="header__logo"><BrandMark size={34} /></span>
          <div class="header__lockup">
            <h1 class="header__title">{t('appName')}</h1>
            <span class="header__descriptor">{t('brandDescriptor')}</span>
          </div>
        </a>

        <div class="header__controls">
          {installPrompt && (
            <button
              type="button"
              class="theme-toggle install-app-btn"
              onClick={handleInstall}
              title={t('installApp')}
            >
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span>{t('installApp')}</span>
            </button>
          )}

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
            <span class="theme-toggle__label">{themeName}</span>
          </button>

          <div class="lang-switcher" role="radiogroup" aria-label={t('languageLabel')}>
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

          <select
            id="lang-select"
            class="lang-select"
            value={lang}
            aria-label={t('languageLabel')}
            onChange={(e) => switchLanguage((e.currentTarget as HTMLSelectElement).value as Language)}
          >
            {languages.map((l) => (
              <option key={l} value={l}>{LANG_CONFIG[l].label}</option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
