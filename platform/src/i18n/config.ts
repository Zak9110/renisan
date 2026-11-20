// Pure locale facts, safe to import anywhere (no Next.js imports).
export const locales = ["ar", "ckb", "kmr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

export const direction: Record<Locale, "rtl" | "ltr"> = { ar: "rtl", ckb: "rtl", kmr: "ltr", en: "ltr" };

/** Native names for the language switcher. */
export const localeNames: Record<Locale, string> = {
  ar: "العربية",
  ckb: "کوردی (سۆرانی)",
  kmr: "Kurdî (Kurmancî)",
  en: "English",
};

export const TIME_ZONE = "Asia/Baghdad";

/** Required by .agents/rules/10-i18n-rtl.md: must render in ar and ckb. */
export const GLYPH_TEST = "ڕێنیشان — خوێندکار — ئەو ڤێدیۆیە";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function dirOf(locale: string): "rtl" | "ltr" {
  return isLocale(locale) ? direction[locale] : direction[defaultLocale];
}

/** DB i18n fallback: requested locale, then en, then any available. */
export function pickText(text: Partial<Record<Locale, string>> | null | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] ?? text.en ?? Object.values(text).find((v) => !!v) ?? "";
}
