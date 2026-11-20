import { useState, useEffect, useCallback } from 'preact/hooks';
import type { Language, TranslationKeys } from '../lib/i18n';
import { getLanguage, setLanguage, onLanguageChange, LANG_CONFIG, languageChain } from '../lib/i18n';
import { fillTemplate } from '../lib/format';

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
    // A missing or empty string falls back through the language chain instead of showing the raw key
    for (const l of languageChain(lang)) {
      const v = translations[l]?.[key];
      if (v) return v;
    }
    return key;
  }, [lang, translations]);

  /** Translation with `{placeholder}` values filled in. */
  const tf = useCallback(
    (key: keyof TranslationKeys, values: Record<string, string | number>): string => fillTemplate(t(key), values),
    [t]
  );

  const config = LANG_CONFIG[lang];

  return { lang, t, tf, switchLanguage, config, isLoaded: !!translations };
}
