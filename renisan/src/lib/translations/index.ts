import type { Language, TranslationKeys } from '../i18n';
import { ar } from './ar';
import { ckb } from './ckb';
import { kmr } from './kmr';
import { en } from './en';

export const translations: Record<Language, TranslationKeys> = { ar, ckb, kmr, en };

export function t(lang: Language, key: keyof TranslationKeys): string {
  return translations[lang][key];
}
