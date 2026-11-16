import { useState, useEffect, useCallback } from 'preact/hooks';
import type { Language, TranslationKeys } from '../lib/i18n';
import { getLanguage, setLanguage, onLanguageChange, LANG_CONFIG } from '../lib/i18n';

// Lazy load translations to keep initial bundle small
let translationsCache: Record<Language, TranslationKeys> | null = null;

async function loadTranslations(): Promise<Record<Language, TranslationKeys>> {
  if (translationsCache) return translationsCache;
  const mod = await import('../lib/translations/index');
  translationsCache = mod.translations;
  return translationsCache;
}

/**
 * React hook for i18n — returns current language, translation function, and language setter.
 */
export function useI18n() {
  const [lang, setLang] = useState<Language>(getLanguage());
  const [translations, setTranslations] = useState<Record<Language, TranslationKeys> | null>(null);

  useEffect(() => {
    loadTranslations().then(setTranslations);
    return onLanguageChange((newLang) => {
      setLang(newLang);
    });
  }, []);

  const switchLanguage = useCallback((newLang: Language) => {
    setLanguage(newLang);
    setLang(newLang);
  }, []);

  const t = useCallback((key: keyof TranslationKeys): string => {
    if (!translations) return key;
    return translations[lang]?.[key] ?? key;
  }, [lang, translations]);

  const config = LANG_CONFIG[lang];

  return { lang, t, switchLanguage, config, isLoaded: !!translations };
}
