// ============================================
// Renisan — Localized place names
// Datasets store place names in Arabic; this maps them for Kurdish readers.
// Unknown names fall back to the original string, so new data never breaks the UI.
// ============================================

import type { Language } from './i18n';

type PlaceNames = { ckb: string; kmr: string };

const PLACES: Record<string, PlaceNames> = {
  // Federal governorates
  'بغداد': { ckb: 'بەغدا', kmr: 'Bexda' },
  'نينوى': { ckb: 'نەینەوا', kmr: 'Neynewa' },
  'البصرة': { ckb: 'بەسرە', kmr: 'Besra' },
  'صلاح الدين': { ckb: 'سەڵاحەدین', kmr: 'Selahedîn' },
  'كركوك': { ckb: 'کەرکووک', kmr: 'Kerkûk' },
  'الأنبار': { ckb: 'ئەنبار', kmr: 'Enbar' },
  'بابل': { ckb: 'بابل', kmr: 'Babil' },
  'كربلاء': { ckb: 'کەربەلا', kmr: 'Kerbela' },
  'النجف': { ckb: 'نەجەف', kmr: 'Necef' },
  'ديالى': { ckb: 'دیالە', kmr: 'Diyale' },
  'واسط': { ckb: 'واست', kmr: 'Wasit' },
  'ذي قار': { ckb: 'زیقار', kmr: 'Ziqar' },
  'ميسان': { ckb: 'مەیسان', kmr: 'Meysan' },
  'المثنى': { ckb: 'موسەننا', kmr: 'Musenna' },
  'القادسية': { ckb: 'قادسیە', kmr: 'Qadisiye' },
  // KRG cities
  'دهوك': { ckb: 'دهۆک', kmr: 'Duhok' },
  'أربيل': { ckb: 'هەولێر', kmr: 'Hewlêr' },
  'اربيل': { ckb: 'هەولێر', kmr: 'Hewlêr' },
  'السليمانية': { ckb: 'سلێمانی', kmr: 'Silêmanî' },
  'حلبجة': { ckb: 'هەڵەبجە', kmr: 'Helebce' },
  'زاخو': { ckb: 'زاخۆ', kmr: 'Zaxo' },
  'شنگال (سنجار)': { ckb: 'شنگال', kmr: 'Şengal' },
  'كلار (كرميان)': { ckb: 'کەلار (گەرمیان)', kmr: 'Kelar (Germiyan)' },
  // Scholarship host countries
  'تركيا': { ckb: 'تورکیا', kmr: 'Tirkiye' },
  'المجر': { ckb: 'هەنگاریا', kmr: 'Macaristan' },
  'العراق': { ckb: 'عێراق', kmr: 'Iraq' },
  'العراق / محلي': { ckb: 'عێراق / ناوخۆیی', kmr: 'Iraq / Navxweyî' },
  'إقليم كوردستان - العراق': { ckb: 'هەرێمی کوردستان - عێراق', kmr: 'Herêma Kurdistanê - Iraq' },
  'العراق وإقليم كوردستان': { ckb: 'عێراق و هەرێمی کوردستان', kmr: 'Iraq û Herêma Kurdistanê' },
  'الولايات المتحدة الأمريكية': { ckb: 'ویلایەتە یەکگرتووەکانی ئەمریکا', kmr: 'Dewletên Yekbûyî yên Amerîkayê' },
  'الصين': { ckb: 'چین', kmr: 'Çîn' },
  'ألمانيا': { ckb: 'ئەڵمانیا', kmr: 'Almanya' },
  'دول متعددة': { ckb: 'چەند وڵاتێک', kmr: 'Gelek welat' }
};

/** Returns the place name in the reader's language, falling back to the stored (Arabic) name. */
export function localizePlace(name: string, lang: Language): string {
  if (lang === 'ar') return name;
  return PLACES[name]?.[lang] ?? name;
}
