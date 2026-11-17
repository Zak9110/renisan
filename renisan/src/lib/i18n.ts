// ============================================
// Renisan i18n — Lightweight typed translation system
// Supports: Arabic (ar), Sorani Kurdish (ckb), Kurmanji Kurdish (kmr-Latn)
// ============================================

export type Language = 'ar' | 'ckb' | 'kmr';

export interface LangConfig {
  dir: 'rtl' | 'ltr';
  label: string;
  name: string;
  bcp47: string;
  fontFamily: string;
}

export const LANG_CONFIG: Record<Language, LangConfig> = {
  ar: {
    dir: 'rtl',
    label: 'عربي',
    name: 'العربية',
    bcp47: 'ar-IQ',
    fontFamily: "'Vazirmatn', system-ui, sans-serif"
  },
  ckb: {
    dir: 'rtl',
    label: 'کوردی',
    name: 'کوردی سۆرانی',
    bcp47: 'ckb',
    fontFamily: "'Vazirmatn', system-ui, sans-serif"
  },
  kmr: {
    dir: 'ltr',
    label: 'Kurdî',
    name: 'Kurdî (Kurmancî)',
    bcp47: 'kmr-Latn',
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  }
};

export interface TranslationKeys {
  // App
  appName: string;
  appTagline: string;

  // Navigation
  navChecker: string;
  navScholarships: string;

  // System selector
  systemFederal: string;
  systemKRG: string;
  systemFederalDesc: string;
  systemKRGDesc: string;

  // Eligibility checker
  scoreLabel: string;
  scorePlaceholder: string;
  streamLabel: string;
  streamScientific: string;
  streamLiterary: string;
  streamVocational: string;
  subStreamBio: string;
  subStreamApplied: string;
  governorateLabel: string;
  governorateAll: string;
  studyTypeLabel: string;
  studyTypeMorning: string;
  studyTypeEvening: string;
  studyTypeParallel: string;
  studyTypeGovernment: string;
  channelLabel: string;
  channelGeneral: string;
  channelMartyrs: string;
  channelDistinguished: string;
  channelSurvivors: string;
  checkButton: string;

  // KRG composite
  krgCompositeTitle: string;
  krgGrade12: string;
  krgGrade11: string;
  krgGrade10: string;
  krgCompositeResult: string;

  // Results
  resultsTitle: string;
  resultsCount: string;
  resultsEmpty: string;
  resultsEmptyHint: string;
  resultMinScore: string;
  resultSeats: string;
  resultStudyType: string;
  resultChannel: string;
  resultConfidenceOfficial: string;
  resultConfidenceVerified: string;
  resultConfidenceUnverified: string;
  resultDataYear: string;
  resultSource: string;

  // Scholarships
  scholarshipsTitle: string;
  scholarshipsSubtitle: string;
  scholarshipOpen: string;
  scholarshipClosed: string;
  scholarshipUpcoming: string;
  scholarshipDiscontinued: string;
  scholarshipDeadline: string;
  scholarshipEligibility: string;
  scholarshipCovers: string;
  scholarshipApply: string;
  scholarshipLastVerified: string;
  scholarshipAge: string;
  scholarshipGPA: string;
  scholarshipLanguage: string;
  scholarshipRefugeeEligible: string;
  scholarshipSurvivorEligible: string;
  scholarshipFilterAll: string;
  scholarshipFilterOpen: string;
  scholarshipFilterDegree: string;
  scholarshipFilterCountry: string;
  scholarshipAcceptanceRate: string;
  scholarshipExchange: string;
  scholarshipFullScholarship: string;
  scholarshipPartialScholarship: string;
  scholarshipFellowship: string;
  scholarshipTuition: string;
  scholarshipStipend: string;
  scholarshipHousing: string;
  scholarshipInsurance: string;
  scholarshipFlights: string;

  // Share
  shareButton: string;
  shareCopied: string;
  shareTitle: string;

  // Disclaimer
  disclaimerText: string;

  // Offline
  offlineReady: string;
  offlineIndicator: string;

  // Footer
  footerDisclaimer: string;
  footerDataSource: string;
  footerBuiltBy: string;

  // General
  loading: string;
  error: string;
  retry: string;
  close: string;
  bachelor: string;
  masters: string;
  phd: string;

  // Added keys (previously hardcoded Arabic strings)
  subStreamLabel: string;
  compositeShow: string;
  compositeHide: string;
  scoreOutOfRange: string;
  scholarshipStatusLabel: string;
  scholarshipsFound: string;
  scholarshipsEmpty: string;
  scholarshipsEmptyHint: string;
  scholarshipDeadlinePassed: string;
  resetFilters: string;
  disclaimerShort: string;
  showMore: string;
  showLess: string;
  nearestProgram: string;
  clearSearch: string;
  compositeBestOfApplied: string;
  reportDataError: string;
  deadlineExpected: string;
  deadlineTBA: string;
  compositeEstimateNote: string;
  enterScorePrompt: string;
  enterScoreHint: string;
  channelMedicalFree: string;

  // New UX & Design enhancements
  navWishlist: string;
  searchPlaceholder: string;
  sortByLabel: string;
  sortCutoffDesc: string;
  sortCutoffAsc: string;
  sortClosest: string;
  sortAlpha: string;
  scoreDeltaSafe: string;
  scoreDeltaTarget: string;
  scoreDeltaReach: string;
  showReachLabel: string;
  reachTag: string;
  saveToWishlist: string;
  removeFromWishlist: string;
  wishlistTitle: string;
  wishlistSubtitle: string;
  wishlistEmpty: string;
  wishlistEmptyHint: string;
  copyWishlist: string;
  wishlistCopied: string;
  clearWishlist: string;
  clearWishlistConfirm: string;
  printWishlist: string;
  scholarshipSearchPlaceholder: string;
  daysRemaining: string;
  deadlineUrgent: string;
  clearScore: string;
  quickPresets: string;
  activeFiltersLabel: string;
  clearAllFilters: string;
  backToTop: string;
  krgFormulaBreakdown: string;
  wishlistAverageScore: string;
  wishlistTotalItems: string;

  // Data-driven year labels, theme, gender/level filters (2026-2027 update)
  themeLabel: string;
  themeSystem: string;
  themeDark: string;
  themeLight: string;
  genderLabel: string;
  genderAny: string;
  genderMale: string;
  genderFemale: string;
  tagMaleOnly: string;
  tagFemaleOnly: string;
  levelLabel: string;
  levelAll: string;
  levelCollege: string;
  levelInstitute: string;
  resultTotalScore: string;
  dataYearTag: string;
  federalDataNote: string;
  krgDataNote: string;
  scoreAbove100Hint: string;
  officialSourceLink: string;
  campusLabel: string;

  // Year-over-year trends, result paging, rule-based routes (Nov 2026)
  trendLabel: string;
  trendPrev: string;
  trendUp: string;
  trendDown: string;
  trendSame: string;
  trendNew: string;
  showMoreResults: string;
  routesTitle: string;
  routesSubtitle: string;
  routesEligible: string;
  routesField: string;
  routesGovEvening: string;
  routesPrivateMorning: string;
  routesPrivateEvening: string;
  routesMedicalTitle: string;
  routesMedicalNote: string;
  routesMartyrsNote: string;
  routesNotOffered: string;
  routesShowOnlyEligible: string;
  routesMorning: string;
  routesEvening: string;
  wishlistMoveUp: string;
  wishlistMoveDown: string;
  wishlistOrderHint: string;
  filtersMore: string;
  filtersHide: string;
  chanceSummaryLabel: string;
  chanceSummaryHint: string;
}

// Default language
const STORAGE_KEY = 'renisan_lang';

const DEFAULT_LANG: Language = 'ckb';

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LANG_CONFIG, value);
}

/** Reads the saved language, tolerating blocked storage and stale/invalid values. */
function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Storage unavailable (private mode, blocked cookies) — fall back to default
  }
  return DEFAULT_LANG;
}

function applyLanguageToDocument(lang: Language): void {
  const config = LANG_CONFIG[lang];
  document.documentElement.lang = config.bcp47;
  document.documentElement.dir = config.dir;
  if (document.body) document.body.style.fontFamily = config.fontFamily;
}

/** `?lang=ckb|ar|kmr` in a shared link opens the app in that language (and remembers it). */
function readUrlLanguage(): Language | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('lang');
  return isLanguage(v) ? v : null;
}

let currentLang: Language = readUrlLanguage() ?? readStoredLanguage();

const listeners: Set<(lang: Language) => void> = new Set();

export function getLanguage(): Language {
  return currentLang;
}

export function setLanguage(lang: Language): void {
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Non-fatal: the choice just won't persist across visits
  }
  applyLanguageToDocument(lang);
  listeners.forEach(fn => fn(lang));
}

export function onLanguageChange(fn: (lang: Language) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Initialize on load (a ?lang= override is also persisted)
if (typeof document !== 'undefined') {
  if (readUrlLanguage()) setLanguage(currentLang); else applyLanguageToDocument(currentLang);
}
