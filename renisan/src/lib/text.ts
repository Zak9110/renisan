// ============================================
// Renisan — Search text normalization
// Arabic and Kurdish keyboards produce different code points for the "same"
// letter (e.g. Kurdish ک/ی vs Arabic ك/ي, and أ/إ/آ vs ا). Without folding these,
// a Sorani user typing "کۆلێژ" or "بەغدا" never matches Arabic-script data.
// ============================================

const FOLD: Record<string, string> = {
  // Kaf / Yeh variants
  'ك': 'ک', 'ي': 'ی', 'ى': 'ی', 'ې': 'ی', 'ێ': 'ی',
  // Alef variants
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  // Teh marbuta / Kurdish ae -> heh
  'ة': 'ه', 'ە': 'ه', 'ھ': 'ه',
  // Kurdish letters with marks -> base letter
  'ۆ': 'و', 'ۊ': 'و', 'ڕ': 'ر', 'ڵ': 'ل', 'ڤ': 'ف',
  // Hamza carriers
  'ؤ': 'و', 'ئ': 'ی'
};

const FOLD_RE = new RegExp(`[${Object.keys(FOLD).join('')}]`, 'g');
// Arabic diacritics (tashkeel), tatweel, zero-width joiners/non-joiners, RTL/LTR marks
const STRIP_RE = /[ً-ٰٟـ​-‏‪-‮]/g;

/** Folds a string into a canonical form for case/script-insensitive matching. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFC')
    .replace(STRIP_RE, '')
    .replace(FOLD_RE, (ch) => FOLD[ch])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Latin accents: "Hewlêr" matches "hewler"
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when every word of `query` appears in at least one of `fields`.
 * Word-wise matching lets "medicine baghdad" find "College of Medicine — Baghdad".
 */
export function matchesQuery(query: string, fields: (string | null | undefined)[]): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const haystack = normalizeForSearch(fields.filter(Boolean).join(' \u0001 '));
  return q.split(' ').every((word) => haystack.includes(word));
}
