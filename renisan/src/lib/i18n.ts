// ============================================
// Renisan i18n — Lightweight typed translation system
// Supports: Arabic (ar), Sorani Kurdish (ckb), Kurmanji Kurdish (kmr-Latn), English (en)
// ============================================

export type Language = 'ar' | 'ckb' | 'kmr' | 'en';

/** Languages in the order the switcher shows them. Add a language here, in LANG_CONFIG, and in translations/. */
export const LANGUAGES: Language[] = ['ckb', 'ar', 'kmr', 'en'];

export interface LangConfig {
  dir: 'rtl' | 'ltr';
  label: string;
  name: string;
  bcp47: string;
  fontFamily: string;
  /** Writing system — Latin-script languages prefer Latin data, Arabic-script prefer Arabic-script data. */
  script: 'arab' | 'latn';
  /** Order to try other languages when a value is missing in this one (same script first). */
  fallbacks: Language[];
  /** Gregorian month names as used in Iraq / the Kurdistan Region (index 0 = January). */
  months: string[];
  /** Shown before the translation bundle has loaded, so it lives here rather than in translations/. */
  loadingLabel: string;
}

export const LANG_CONFIG: Record<Language, LangConfig> = {
  ar: {
    dir: 'rtl',
    label: 'عربي',
    name: 'العربية',
    bcp47: 'ar-IQ',
    fontFamily: "'Vazirmatn', system-ui, sans-serif",
    script: 'arab',
    fallbacks: ['ckb', 'en', 'kmr'],
    months: ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'],
    loadingLabel: 'جارٍ التحميل…'
  },
  ckb: {
    dir: 'rtl',
    label: 'کوردی',
    name: 'کوردی سۆرانی',
    bcp47: 'ckb',
    fontFamily: "'Vazirmatn', system-ui, sans-serif",
    script: 'arab',
    fallbacks: ['ar', 'en', 'kmr'],
    months: ['کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران', 'تەممووز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم'],
    loadingLabel: 'بارکردن…'
  },
  kmr: {
    dir: 'ltr',
    label: 'Kurdî',
    name: 'Kurdî (Kurmancî)',
    bcp47: 'kmr-Latn',
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    script: 'latn',
    fallbacks: ['en', 'ckb', 'ar'],
    months: ['Kanûna Paşîn', 'Sibat', 'Adar', 'Nîsan', 'Gulan', 'Hezîran', 'Tîrmeh', 'Tebax', 'Îlon', 'Cotmeh', 'Mijdar', 'Kanûna Pêşîn'],
    loadingLabel: 'Tê barkirin…'
  },
  en: {
    dir: 'ltr',
    label: 'EN',
    name: 'English',
    bcp47: 'en',
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    script: 'latn',
    fallbacks: ['kmr', 'ar', 'ckb'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    loadingLabel: 'Loading…'
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

  // Brand, hero and footer
  brandDescriptor: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  statCutoffs: string;
  statScholarships: string;
  statLanguages: string;
  footerExplore: string;
  footerSources: string;
  footerUpdated: string;
  footerIndependent: string;

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

  // System upgrade: Federal calculator, Form Advisor, Scholarship Matcher, Details & Calendar
  federalCalcTitle: string;
  federalBaseAverage: string;
  federalFirstRound: string;
  federalForeignLang: string;
  federalForeignPlaceholder: string;
  federalCalcResult: string;
  federalTotalDetected: string;
  scholarshipMatchBanner: string;
  scholarshipMatchAction: string;
  scholarshipMyGPA: string;
  scholarshipMyAge: string;
  scholarshipAddCalendar: string;
  scholarshipGpaMatch: string;
  scholarshipGpaShort: string;
  detailsShow: string;
  detailsHide: string;
  detailsHistoryTitle: string;
  detailsSiblingsTitle: string;
  detailsTotalDiff: string;
  wishlistAdvisorTitle: string;
  wishlistInversionWarning: string;
  wishlistAutoSort: string;
  wishlistSafetyWarning: string;
  wishlistOrderOptimal: string;
  wishlistBreakdown: string;
  planLabel: string;
  planDefaultName: string;
  planNew: string;
  planCopy: string;
  planRename: string;
  planDelete: string;
  planDeleteConfirm: string;
  planNamePrompt: string;
  planLimit: string;
  planHint: string;
  formProgress: string;
  formProgressDone: string;
  formRulesSource: string;
  formNeedStream: string;
  formMixedSystems: string;
  formWrongStream: string;
  formWrongGender: string;
  formWrongChannel: string;
  copyForForm: string;
  formCopyHeader: string;
  wishlistMoveTo: string;
  profileSaved: string;
  profileForget: string;
  installApp: string;

  // Accessibility labels (previously hardcoded English)
  languageLabel: string;
  systemSelectorLabel: string;

  // Explainable eligibility matching, deadlines hub & application stage tracking
  eligibilityProfileTitle: string;
  eligibilityProfileHint: string;
  eduLevelLabel: string;
  eduLevelAny: string;
  eduLevelGrade12: string;
  eduLevelUndergrad: string;
  eduLevelGraduate: string;
  workExpLabel: string;
  workExpNone: string;
  workExpOne: string;
  workExpTwoPlus: string;
  englishLevelLabel: string;
  englishLevelAny: string;
  englishLevelNone: string;
  englishLevelBasic: string;
  englishLevelCert: string;
  eligibleOnlyToggle: string;
  eligibleModeAll: string;
  eligibleModeGo: string;
  eligibleModeGoMaybe: string;
  verdictGo: string;
  verdictMaybe: string;
  verdictNoGo: string;
  reasonDegreeOk: string;
  reasonDegreeFail: string;
  reasonUndergradEnrolled: string;
  reasonGpaOk: string;
  reasonGpaFail: string;
  reasonGpaMissing: string;
  reasonAgeOk: string;
  reasonAgeBorderline: string;
  reasonAgeFail: string;
  reasonAgeMissing: string;
  reasonWorkExpOk: string;
  reasonWorkExpFail: string;
  reasonWorkExpMissing: string;
  reasonReturnFail: string;
  reasonGenderFail: string;
  reasonEnglishOk: string;
  reasonEnglishCheck: string;
  reasonRefugeeFit: string;
  reasonSurvivorFit: string;
  reasonDiscontinued: string;
  viewCards: string;
  viewDeadlines: string;
  deadlinesUrgentTitle: string;
  deadlinesSoonTitle: string;
  deadlinesUpcomingTitle: string;
  deadlinesEstimatedTitle: string;
  deadlinesTbaTitle: string;
  deadlinesClosedTitle: string;
  deadlinesExportAll: string;
  stageLabel: string;
  stageSaved: string;
  stagePreparing: string;
  stageApplied: string;
  stageGotIt: string;
  stageRejected: string;
  itemNotePlaceholder: string;
}

// Default language
const STORAGE_KEY = 'renisan_lang';

const DEFAULT_LANG: Language = 'ckb';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LANG_CONFIG, value);
}

/** Reads the saved language, tolerating blocked storage and stale/invalid values. */
function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Storage unavailable (private mode, blocked cookies)
  }
  return null;
}

/** Maps the browser's preferred languages onto ours (Arabic / Kurdish only; others keep the default). */
function readBrowserLanguage(): Language | null {
  if (typeof navigator === 'undefined') return null;
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of prefs) {
    const tag = (raw || '').toLowerCase();
    if (tag.startsWith('ckb') || tag === 'ku-iq' || tag.startsWith('ku-arab')) return 'ckb';
    if (tag.startsWith('kmr') || tag.startsWith('ku')) return 'kmr';
    if (tag.startsWith('ar')) return 'ar';
  }
  return null;
}

/** Languages to try, in order, for a value: the reader's own, then its configured fallbacks. */
export function languageChain(lang: Language): Language[] {
  return [lang, ...LANG_CONFIG[lang].fallbacks];
}

/**
 * Picks the best available variant of a multilingual value for the reader.
 * Empty strings / null / undefined / empty arrays count as missing.
 */
export function pickLocalized<T>(lang: Language, variants: Partial<Record<Language, T | null | undefined>>): T | undefined {
  for (const l of languageChain(lang)) {
    const v = variants[l];
    if (v == null || (v as unknown) === '' || (Array.isArray(v) && v.length === 0)) continue;
    return v;
  }
  return undefined;
}

function applyLanguageToDocument(lang: Language): void {
  const config = LANG_CONFIG[lang];
  document.documentElement.lang = config.bcp47;
  document.documentElement.dir = config.dir;
  if (document.body) document.body.style.fontFamily = config.fontFamily;
}

/** `?lang=ckb|ar|kmr|en` in a shared link opens the app in that language (and remembers it). */
function readUrlLanguage(): Language | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('lang');
  return isLanguage(v) ? v : null;
}

let currentLang: Language = readUrlLanguage() ?? readStoredLanguage() ?? readBrowserLanguage() ?? DEFAULT_LANG;

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
  // Keep an existing ?lang= in sync so a refresh doesn't revert to the language the link was opened in
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    const url = new URL(window.location.href);
    if (url.searchParams.has('lang') && url.searchParams.get('lang') !== lang) {
      url.searchParams.set('lang', lang);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }
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
