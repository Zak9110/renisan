import type { TranslationKeys } from '../i18n';

export const ckb: TranslationKeys = {
  // App
  appName: 'ڕێنیسان',
  appTagline: 'ڕێبەری وەرگیرانی زانکۆ و سکۆلارشیپ بۆ خوێندکارانی عێراق و هەرێمی کوردستان',

  // Navigation
  navChecker: 'پشکنەری نمرە',
  navScholarships: 'ڕێبەری سکۆلارشیپ',

  // System selector
  systemFederal: 'وەرگرتنی ناوەندی فیدراڵی',
  systemKRG: 'زانکۆلاین (هەرێمی کوردستان)',
  systemFederalDesc: 'زانکۆ و پەیمانگە حکومییەکانی سەر بە وەزارەتی خوێندنی باڵای فیدراڵ لە بەغدا و پارێزگاکان',
  systemKRGDesc: 'زانکۆ و پەیمانگە حکومییەکانی هەرێمی کوردستان (دهۆک، هەولێر، سلێمانی، هەڵەبجە) لەڕێگەی زانکۆلاین',

  // Eligibility checker
  scoreLabel: 'نمرەی گشتی (یان کۆنمرە)',
  scorePlaceholder: 'نمرەکەت بنووسە (نموونە: 85.50)',
  streamLabel: 'بەشی خوێندن',
  streamScientific: 'زانستی',
  streamLiterary: 'وێژەیی',
  streamVocational: 'پیشەیی',
  subStreamBio: 'زیندەوەرزانی (ئەحیائی)',
  subStreamApplied: 'پراکتیکی (تەتبیقی)',
  governorateLabel: 'پارێزگا / شار',
  governorateAll: 'هەموو پارێزگاکان',
  studyTypeLabel: 'جۆری خوێندن',
  studyTypeMorning: 'بەیانیان',
  studyTypeEvening: 'ئێواران',
  studyTypeParallel: 'پارالێل (خوێندنی تایبەت)',
  studyTypeGovernment: 'زانکۆلاین (حکومی بێبەرامبەر)',
  channelLabel: 'کەناڵی وەرگیران',
  channelGeneral: 'گشتی',
  channelMartyrs: 'کەسوکاری شەهیدان',
  channelDistinguished: 'بەهرەمەندان و نایابەکان',
  channelSurvivors: 'ڕزگاربووان',
  checkButton: 'پشکنینی بەشە شیاوەکان',

  // KRG composite
  krgCompositeTitle: 'هەژمارکردنی کۆنمرەی زانکۆلاین',
  krgGrade12: 'نمرەی پۆلی ۱۲ (۸۰٪)',
  krgGrade11: 'نمرەی پۆلی ۱۱ (۱۰٪)',
  krgGrade10: 'نمرەی پۆلی ۱۰ (۱۰٪)',
  krgCompositeResult: 'کۆنمرەی هەژمارکراو:',

  // Results
  resultsTitle: 'کۆلێژ و بەشە شیاوەکان',
  resultsCount: '{count} بەشی بەردەست دۆزرایەوە',
  resultsEmpty: 'هیچ بەشێک لەگەڵ نمرە و هەڵبژاردنەکانتدا نەگونجا',
  resultsEmptyHint: 'تکایە شارێکی تر تاقی بکەرەوە، یان جۆری خوێندن بکە بە پارالێل، یان دڵنیابە لە دروستیی نمرەکەت.',
  resultMinScore: 'کەمترین نمرەی وەرگیران',
  resultSeats: 'ژمارەی کورسی',
  resultStudyType: 'جۆری خوێندن',
  resultChannel: 'کەناڵ',
  resultConfidenceOfficial: 'داتای فەرمی پشتڕاستکراو',
  resultConfidenceVerified: 'پشتڕاستکراوە لەلایەن سەرچاوەی باوەڕپێکراو',
  resultConfidenceUnverified: 'خەمڵێندراو و پشتڕاستنەکراوە',
  resultDataYear: 'داتای ساڵی',
  resultSource: 'سەرچاوە',

  // Scholarships
  scholarshipsTitle: 'ڕێبەری سکۆلارشیپ و دەرفەتە نێودەوڵەتییەکان',
  scholarshipsSubtitle: 'دەرفەتی سکۆلارشیپی باوەڕپێکراو بۆ خوێندکارانی عێراق و هەرێمی کوردستان، بە ئاوارە و ڕزگاربووانیشەوە',
  scholarshipOpen: 'کراوەیە بۆ پێشکەشکردن',
  scholarshipClosed: 'داخراوە',
  scholarshipUpcoming: 'بەمزووانە دەکرێتەوە',
  scholarshipDiscontinued: 'بەیەکجاری ڕاگیراوە',
  scholarshipDeadline: 'دوا وادەی پێشکەشکردن',
  scholarshipEligibility: 'مەرجەکانی وەرگیران',
  scholarshipCovers: 'بڕ و خزمەتگوزارییەکان',
  scholarshipApply: 'ماڵپەڕی فەرمیی پێشکەشکردن',
  scholarshipLastVerified: 'دواین پشکنین',
  scholarshipAge: 'بەرزترین تەمەن',
  scholarshipGPA: 'کەمترین نمرە (GPA)',
  scholarshipLanguage: 'مەرجی زمان',
  scholarshipRefugeeEligible: 'گونجاوە بۆ پەنابەر و ئاوارەکان',
  scholarshipSurvivorEligible: 'تایبەت بە ڕزگاربووان',
  scholarshipFilterAll: 'هەموو',
  scholarshipFilterOpen: 'تەنها کراوەکان',
  scholarshipFilterDegree: 'ئاستی خوێندن',
  scholarshipFilterCountry: 'وڵات',
  scholarshipAcceptanceRate: 'ڕێژەی وەرگیران',
  scholarshipExchange: 'بەرنامەی ئاڵوگۆڕی خوێندن',
  scholarshipFullScholarship: 'سکۆلارشیپی تەواو (فول فەند)',
  scholarshipPartialScholarship: 'سکۆلارشیپی نیوەیی (پارشیاڵ)',
  scholarshipFellowship: 'هاوکاریی توێژینەوە (فێلۆشیپ)',
  scholarshipTuition: 'کرێی خوێندن (بێبەرامبەر)',
  scholarshipStipend: 'مووچەی مانگانە',
  scholarshipHousing: 'شوێنی مانەوە (بەشەناوخۆیی)',
  scholarshipInsurance: 'دڵنیایی تەندروستی',
  scholarshipFlights: 'تکتی فڕۆکە هاتووچۆ',

  // Share
  shareButton: 'هاوبەشکردنی ئەنجامەکان',
  shareCopied: 'لینکەکە لەبەرگیرایەوە',
  shareTitle: 'ئەنجامی پشکنینی ڕێنیسان',

  // Disclaimer
  disclaimerText: 'ئاگاداری: ئەم نمرانە کەمترین کۆنمرەی وەرگیرانی ساڵی ڕابردوون (٢٠٢٣-٢٠٢٤) و تەنها وەک ڕێبەری بەکاردێن. نمرەی ئەمساڵ بەپێی کێبڕکێ و کورسییە بەتاڵەکان دەگۆڕێت.',

  // Offline
  offlineReady: 'ئەپڵیکەیشن بە ئۆفلاین و بێ ئینتەرنێت کاردەکات',
  offlineIndicator: 'بەبێ ئینتەرنێت کاردەکات',

  // Footer
  footerDisclaimer: 'ڕێنیسان پلاتفۆرمێکی سەربەخۆ و قازانج‌نەویستە. تکایە هەمیشە سەردانی ماڵپەڕە فەرمییەکانی وەزارەتی خوێندنی باڵا بکەن.',
  footerDataSource: 'سەرچاوەی داتا: وەزارەتی خوێندنی باڵای عێراق (ڕێبەری وەرگیران ٢٠٢٤) و دەروازەی زانکۆلاین (هەرێمی کوردستان).',
  footerBuiltBy: 'دروستکراوە بۆ ڕێنوێنی و هاوکاریی خوێندکارانی عێراق و هەرێمی کوردستان.',

  // General
  loading: 'چاوەڕوانبن...',
  error: 'هەڵەیەک ڕوویدا لە بارکردنی داتاکاندا',
  retry: 'دووبارە هەوڵبدەوە',
  close: 'داخستن',
  bachelor: 'بەکالۆریۆس',
  masters: 'ماستەر',
  phd: 'دکتۆرا',
  subStreamLabel: 'لقی پسپۆڕی',
  compositeShow: 'هەژمارکردنی کۆنمرە',
  compositeHide: 'شاردنەوە',
  scoreOutOfRange: 'نمرە دەبێت ژمارەیەک بێت لە نێوان 0 و 100',
  scholarshipStatusLabel: 'دۆخ',
  scholarshipsFound: '{count} دەرفەتی گونجاو دۆزرایەوە',
  scholarshipsEmpty: 'هیچ سکۆلارشیپێک لەگەڵ هەڵبژاردنەکانتدا ناگونجێت',
  scholarshipsEmptyHint: 'فلتەرەکان ڕێکبخەرەوە یان مەرجی پەنابەران لابەرە بۆ بینینی هەموو دەرفەتەکان.',
  scholarshipDeadlinePassed: 'وادەکە بەسەرچووە — سەردانی ماڵپەڕی فەرمی بکە بۆ خولی داهاتوو',
  resetFilters: 'سڕینەوەی فلتەرەکان',
  enterScorePrompt: 'نمرەکەت بنووسە بۆ بینینی بەشە بەردەستەکان',
  enterScoreHint: 'نمرەی کۆتاییت بنووسە (لە 0 تا 100). دەتوانیت ژمارەی کوردی، عەرەبی یان ئینگلیزی بەکاربهێنیت.',
  channelMedicalFree: 'خوێندنی پزیشکیی بێبەرامبەر'
};
