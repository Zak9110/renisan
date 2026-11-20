// ============================================
// Renisan — Localized place names
// Datasets store place names in Arabic; this maps them for Kurdish and English readers.
// Unknown names fall back to the original string, so new data never breaks the UI.
// ============================================

import type { Language } from './i18n';

type PlaceNames = { ckb: string; kmr: string; en: string };

const PLACES: Record<string, PlaceNames> = {
  // Federal governorates
  'بغداد': { ckb: 'بەغدا', kmr: 'Bexda', en: 'Baghdad' },
  'نينوى': { ckb: 'نەینەوا', kmr: 'Neynewa', en: 'Nineveh (Mosul)' },
  'البصرة': { ckb: 'بەسرە', kmr: 'Besra', en: 'Basrah' },
  'صلاح الدين': { ckb: 'سەڵاحەدین', kmr: 'Selahedîn', en: 'Saladin (Tikrit)' },
  'كركوك': { ckb: 'کەرکووک', kmr: 'Kerkûk', en: 'Kirkuk' },
  'الأنبار': { ckb: 'ئەنبار', kmr: 'Enbar', en: 'Anbar' },
  'بابل': { ckb: 'بابل', kmr: 'Babil', en: 'Babylon' },
  'كربلاء': { ckb: 'کەربەلا', kmr: 'Kerbela', en: 'Karbala' },
  'النجف': { ckb: 'نەجەف', kmr: 'Necef', en: 'Najaf' },
  'ديالى': { ckb: 'دیالە', kmr: 'Diyale', en: 'Diyala' },
  'واسط': { ckb: 'واست', kmr: 'Wasit', en: 'Wasit' },
  'ذي قار': { ckb: 'زیقار', kmr: 'Ziqar', en: 'Thi-Qar' },
  'ميسان': { ckb: 'مەیسان', kmr: 'Meysan', en: 'Misan' },
  'المثنى': { ckb: 'موسەننا', kmr: 'Musenna', en: 'Al-Muthanna' },
  'القادسية': { ckb: 'قادسیە', kmr: 'Qadisiye', en: 'Al-Qadisiyah' },
  // KRG cities
  'دهوك': { ckb: 'دهۆک', kmr: 'Duhok', en: 'Duhok' },
  'أربيل': { ckb: 'هەولێر', kmr: 'Hewlêr', en: 'Erbil (Hawler)' },
  'اربيل': { ckb: 'هەولێر', kmr: 'Hewlêr', en: 'Erbil (Hawler)' },
  'السليمانية': { ckb: 'سلێمانی', kmr: 'Silêmanî', en: 'Sulaimani' },
  'حلبجة': { ckb: 'هەڵەبجە', kmr: 'Helebce', en: 'Halabja' },
  'زاخو': { ckb: 'زاخۆ', kmr: 'Zaxo', en: 'Zakho' },
  'شنگال (سنجار)': { ckb: 'شنگال', kmr: 'Şengal', en: 'Sinjar (Shingal)' },
  'كلار (كرميان)': { ckb: 'کەلار (گەرمیان)', kmr: 'Kelar (Germiyan)', en: 'Kalar (Garmian)' },
  'كوية': { ckb: 'کۆیە', kmr: 'Koye', en: 'Koya' },
  'سوران': { ckb: 'سۆران', kmr: 'Soran', en: 'Soran' },
  'رانية (رابرين)': { ckb: 'ڕانیە (ڕاپەڕین)', kmr: 'Ranye (Raperîn)', en: 'Ranya (Raparin)' },
  'جمجمال': { ckb: 'چەمچەماڵ', kmr: 'Çemçemal', en: 'Chamchamal' },
  'عقرة': { ckb: 'ئاکرێ', kmr: 'Akrê', en: 'Akre' },
  'خانقين': { ckb: 'خانەقین', kmr: 'Xaneqîn', en: 'Khanaqin' },
  // Scholarship host countries
  'تركيا': { ckb: 'تورکیا', kmr: 'Tirkiye', en: 'Türkiye' },
  'المجر': { ckb: 'هەنگاریا', kmr: 'Macaristan', en: 'Hungary' },
  'العراق': { ckb: 'عێراق', kmr: 'Iraq', en: 'Iraq' },
  'العراق / محلي': { ckb: 'عێراق / ناوخۆیی', kmr: 'Iraq / Navxweyî', en: 'Iraq (Domestic)' },
  'إقليم كوردستان - العراق': { ckb: 'هەرێمی کوردستان - عێراق', kmr: 'Herêma Kurdistanê - Iraq', en: 'Kurdistan Region - Iraq' },
  'العراق وإقليم كوردستان': { ckb: 'عێراق و هەرێمی کوردستان', kmr: 'Iraq û Herêma Kurdistanê', en: 'Iraq & Kurdistan Region' },
  'الولايات المتحدة الأمريكية': { ckb: 'ویلایەتە یەکگرتووەکانی ئەمریکا', kmr: 'Dewletên Yekbûyî yên Amerîkayê', en: 'United States' },
  'الصين': { ckb: 'چین', kmr: 'Çîn', en: 'China' },
  'ألمانيا': { ckb: 'ئەڵمانیا', kmr: 'Almanya', en: 'Germany' },
  'دول متعددة': { ckb: 'چەند وڵاتێک', kmr: 'Gelek welat', en: 'Multiple Countries' },
  'المملكة المتحدة': { ckb: 'شانشینی یەکگرتوو (بەریتانیا)', kmr: 'Keyaniya Yekbûyî (Brîtanya)', en: 'United Kingdom' },
  'اليابان': { ckb: 'ژاپۆن', kmr: 'Japonya', en: 'Japan' },
  'الاتحاد الأوروبي': { ckb: 'یەکێتیی ئەوروپا', kmr: 'Yekîtiya Ewropayê', en: 'European Union' }
};

/** True when the name has an entry in the translation table (used by tests and data checks). */
export function isKnownPlace(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(PLACES, name);
}

/** Returns the place name in the reader's language, falling back to the stored (Arabic) name. */
export function localizePlace(name: string, lang: Language): string {
  if (lang === 'ar') return name;
  return PLACES[name]?.[lang] ?? name;
}
