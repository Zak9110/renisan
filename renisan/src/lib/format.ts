// ============================================
// Renisan — tiny string helpers shared by components
// ============================================

import { LANG_CONFIG, type Language } from './i18n.ts';

/** Replaces every `{key}` in a translation string. Missing keys are left as-is. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : m
  );
}

/** Formats a cutoff for display: integers stay short, decimals keep two places. */
export function formatAverage(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
}

/** Signed margin for display: "+3.25", "−0.40", "±0" (true minus sign, no "+0.0"). */
export function formatDelta(diff: number): string {
  const r = Math.round(diff * 100) / 100;
  if (Math.abs(r) < 0.005) return '±0';
  const abs = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(2);
  return `${r > 0 ? '+' : '−'}${abs}`;
}

/**
 * Formats a YYYY-MM-DD date with the month name in the reader's language
 * ("15 March 2027", "15 ئازار 2027"). Uses our own month table because browser
 * support for Kurdish locales is inconsistent. Non-ISO input is returned unchanged.
 */
export function formatDate(iso: string, lang: Language): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = LANG_CONFIG[lang].months[Number(m[2]) - 1];
  if (!month) return iso;
  const day = String(Number(m[3]));
  return lang === 'en' ? `${month} ${day}, ${m[1]}` : `${day} ${month} ${m[1]}`;
}
