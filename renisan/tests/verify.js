// Renisan verification tests.
// Imports the real TypeScript sources (Node >= 22.18 / 23.6 strips types natively),
// so these tests exercise the code that ships rather than copies of it.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeScoreInput, computeKRGComposite, computeFederalScore, detectFederalTotalScore, validateScore, MAX_SCORE_FEDERAL, MAX_SCORE_KRG } from '../src/lib/normalizer.ts';
import { filterFederalCutoffs, filterKRGCutoffs, filterScholarships, getUniqueGovernorates, getUniqueCities } from '../src/lib/search.ts';
import { getEffectiveStatus, isDeadlinePassed } from '../src/lib/status.ts';
import { parseCheckerState, serializeCheckerState, DEFAULT_CHECKER_STATE } from '../src/lib/url-state.ts';
import { localizePlace, isKnownPlace } from '../src/lib/places.ts';
import { normalizeForSearch, matchesQuery } from '../src/lib/text.ts';
import { fillTemplate, formatAverage, formatDate } from '../src/lib/format.ts';
import { LANG_CONFIG, LANGUAGES, pickLocalized, languageChain } from '../src/lib/i18n.ts';
import { buildHistory, getTrend, programKey, coverage } from '../src/lib/history.ts';
import { localizeWishlistItem, analyzeWishlistForm, checkForm, isTechnicalChoice, officialChoiceName, parsePlanStore } from '../src/lib/wishlist.ts';
import * as wishlistStore from '../src/lib/wishlist.ts';
import { sanitizeProfile, ageFromBirthYear, birthYearFromAge } from '../src/lib/profile.ts';
import * as profileStore from '../src/lib/profile.ts';
import { buildScholarshipIcs, buildMultiScholarshipIcs } from '../src/lib/calendar.ts';
import { matchScholarship, getDeadlineBucket, getDaysUntilDeadline, hasEligibilityProfile } from '../src/lib/matcher.ts';
import { validateScholarship, isAggregator, findDuplicate, nameSimilarity } from '../scripts/opportunities/validate.ts';
import { mergeCandidates, toRecord, candidateId, EXTRACT_SCHEMA, buildLeadsResearchPrompt } from '../scripts/opportunities/discover.ts';
import { nextScholarshipId, toListing } from '../scripts/opportunities/review.ts';
import { pageFingerprint, dateFindings, autoExpireListings } from '../scripts/opportunities/watch.ts';
import { parseRssFeed, parseReliefWebResponse, isIraqRelevantLead, dedupeLeads } from '../scripts/opportunities/harvest.ts';
import { ar } from '../src/lib/translations/ar.ts';
import { ckb } from '../src/lib/translations/ckb.ts';
import { kmr } from '../src/lib/translations/kmr.ts';
import { en } from '../src/lib/translations/en.ts';

let suites = 0;
let failed = 0;
function suite(name, fn) {
  try {
    fn();
    suites++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}\n  ${err.message}`);
  }
}

console.log('--- Starting Renisan Verification Tests ---');

// ---------- Data ----------
const DATA_DIR = path.resolve('public/data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
const meta = load('meta.json');
const fedData = load(meta.federal.file);
const krgData = load(meta.krg.file);
const schData = load(meta.scholarships.file);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

suite(`meta.json points at real files (federal ${meta.federal.year_label}, KRG ${meta.krg.year_label})`, () => {
  for (const key of ['federal', 'krg']) {
    const info = meta[key];
    assert(fs.existsSync(path.join(DATA_DIR, info.file)), `${key}.file must exist`);
    assert(Number.isInteger(info.year) && info.file.includes(String(info.year)), `${key}: file name should carry the year`);
    assert(/^\d{4}-\d{4}$/.test(info.year_label), `${key}.year_label must look like 2026-2027`);
    assert(info.max_score >= 100 && info.max_score <= 120, `${key}.max_score sane`);
    assert(/^https?:\/\//.test(info.source_url), `${key}.source_url absolute`);
    assert(ISO.test(info.published), `${key}.published ISO date`);
  }
  assert(ISO.test(meta.updated) && ISO.test(meta.scholarships.verified));
});

suite(`Datasets load (${fedData.length} federal, ${krgData.length} KRG, ${schData.length} scholarships)`, () => {
  assert(fedData.length > 1000, 'Federal data should cover the full ministry list');
  assert(krgData.length >= 90, 'KRG data should cover all major KRG public universities and polytechnics');
  assert(schData.length >= 12, 'Scholarships should have at least 12 verified opportunities');
  const krgCities = getUniqueCities(krgData);
  assert(krgCities.length >= 10, `Expected at least 10 KRG cities, got ${krgCities.length}`);
  assert(krgData.some((r) => r.level === 'institute'), 'KRG technical institutes are tagged');
  assert(krgData.some((r) => r.study_type === 'parallel') && krgData.some((r) => r.study_type === 'evening'), 'KRG covers government, parallel and evening');
});

suite('Dataset integrity (unique ids, scores in range, valid enums, year matches meta)', () => {
  for (const [name, rows, scoreKey, max, year] of [
    ['federal', fedData, 'min_average', meta.federal.max_score, meta.federal.year],
    ['krg', krgData, 'min_composite_score', meta.krg.max_score, meta.krg.year]
  ]) {
    const ids = new Set(rows.map((r) => r.id));
    assert.strictEqual(ids.size, rows.length, `${name}: ids must be unique`);
    for (const r of rows) {
      assert(validateScore(r[scoreKey], max), `${name} ${r.id}: ${scoreKey} out of range`);
      assert(['scientific', 'literary', 'vocational'].includes(r.stream), `${name} ${r.id}: bad stream`);
      assert(['male', 'female', 'both'].includes(r.gender), `${name} ${r.id}: bad gender`);
      assert(['official', 'verified_third_party', 'unverified'].includes(r.confidence), `${name} ${r.id}: bad confidence`);
      assert.strictEqual(r.year, year, `${name} ${r.id}: year must match meta.json`);
      assert(r.university && r.university_en && r.college && r.college_en, `${name} ${r.id}: names required`);
    }
  }
  for (const r of fedData) {
    assert(['morning', 'evening', 'parallel'].includes(r.study_type), `${r.id}: bad study_type`);
    assert(['general', 'martyrs', 'distinguished', 'medical_free', 'survivors'].includes(r.channel), `${r.id}: bad channel`);
    assert(!r.level || ['college', 'institute'].includes(r.level), `${r.id}: bad level`);
    if (r.min_score != null) {
      // The ministry's competitive average is the total divided by 7
      assert(Math.abs(r.min_score / 7 - r.min_average) < 0.011, `${r.id}: min_average must equal min_score/7`);
    }
  }
  const schIds = new Set(schData.map((s) => s.id));
  assert.strictEqual(schIds.size, schData.length, 'scholarship ids must be unique');
  for (const s of schData) {
    assert(['open', 'closed', 'upcoming', 'discontinued'].includes(s.status), `${s.id}: bad status`);
    assert(/^https?:\/\//.test(s.application_url), `${s.id}: application_url must be absolute`);
    assert(ISO.test(s.last_verified), `${s.id}: last_verified must be YYYY-MM-DD`);
    if (s.deadline && /^\d/.test(s.deadline)) {
      assert(ISO.test(s.deadline), `${s.id}: deadline must be YYYY-MM-DD`);
    }
    assert(s.name && s.name_ckb && s.name_kmr, `${s.id}: English and Kurdish names required`);
    assert(Array.isArray(s.covers) && s.covers.length > 0, `${s.id}: covers required`);
    assert(Array.isArray(s.covers_en) && s.covers_en.length > 0, `${s.id}: covers_en required`);
  }
});

suite('Federal 2026-2027 official rows are present and plausible', () => {
  const baghdadMed = fedData.find((r) => r.university_en === 'University of Baghdad' && r.college_en === 'College of Medicine');
  assert(baghdadMed, 'Baghdad Medicine row must exist');
  assert(baghdadMed.min_average > 100, 'Top medicine cutoffs exceed 100 (foreign-language bonus) — the app must accept them');
  assert(baghdadMed.min_average <= MAX_SCORE_FEDERAL);
  assert(fedData.every((r) => r.governorate), 'Every row has a governorate');
  assert(fedData.some((r) => r.level === 'institute'), 'Technical institutes are tagged');
  assert(fedData.some((r) => r.gender === 'female'), 'Single-sex programmes keep their gender');
  const govs = getUniqueGovernorates(fedData);
  assert(govs.length >= 15, `Expect all 15 federal governorates, got ${govs.length}`);
  assert.strictEqual(fedData.filter((r) => r.department && !r.department_en).length, 0, 'Every department has an English name');
});

// ---------- Normalizer ----------
suite('Normalizer', () => {
  assert.strictEqual(normalizeScoreInput('٨٥.٥'), '85.5', 'Eastern Arabic digits conversion');
  assert.strictEqual(normalizeScoreInput('۸۵.۵'), '85.5', 'Persian/Kurdish digits conversion');
  assert.strictEqual(normalizeScoreInput('٩٢،٧٥'), '92.75', 'Arabic comma to decimal point');
  assert.strictEqual(normalizeScoreInput('  ٧٠% '), '70', 'Strip non-numeric signs like percent and spaces');
  assert.strictEqual(normalizeScoreInput('1.2.3'), '1.23', 'Collapse extra decimal points');
  assert(validateScore(0) && validateScore(100) && validateScore(101.29), 'Federal bounds include >100 averages');
  assert(!validateScore(MAX_SCORE_FEDERAL + 0.01) && !validateScore(-1) && !validateScore(NaN), 'Reject out-of-range');
  assert(!validateScore(100.5, MAX_SCORE_KRG) && validateScore(100, MAX_SCORE_KRG), 'KRG ceiling stays at 100');
  assert.strictEqual(fillTemplate('{count} x {year}', { count: 3, year: '2026-2027' }), '3 x 2026-2027');
  assert.strictEqual(fillTemplate('{missing}', {}), '{missing}', 'Unknown placeholders left intact');
  assert.strictEqual(formatAverage(100), '100');
  assert.strictEqual(formatAverage(99.4), '99.40');
});

// ---------- KRG composite & Federal competitive calculator ----------
suite('KRG composite & Federal competitive score formulas', () => {
  assert.strictEqual(computeKRGComposite(80, 90, 90), 82, '80*0.8 + 90*0.1 + 90*0.1 = 82');
  assert.strictEqual(computeKRGComposite(85, 60, 60), 85, 'Best-of protection keeps G12 when composite is lower');
  assert.strictEqual(computeKRGComposite(90), 90, 'Missing G10/G11 falls back to G12');

  const fed1 = computeFederalScore(100, true, 100);
  // 700 + 7 (1st round) + 8 (8% of 100) = 715 => 715 / 7 = 102.14
  assert.strictEqual(fed1.total, 715, 'Federal total includes +7 round 1 and +8 foreign lang');
  assert.strictEqual(fed1.average, 102.14, 'Federal competitive average exceeds 100 with bonuses');

  const detected = detectFederalTotalScore('٦٥٠');
  assert(detected && detected.total === 650 && detected.average === 92.86, 'Detects 7-subject total in Arabic digits');
  assert.strictEqual(detectFederalTotalScore('95.5'), null, 'Normal percentage average is not treated as 7-subject total');
});

// ---------- Search ----------
suite('Cutoff filtering', () => {
  const fed = filterFederalCutoffs(fedData, { system: 'federal', score: 90, stream: 'scientific' });
  assert(fed.length > 0, 'A 90 scientific student should match something');
  assert(fed.every((r) => r.min_average <= 90 && r.stream === 'scientific'), 'Federal filter respects score + stream');
  for (let i = 1; i < fed.length; i++) {
    assert(fed[i - 1].min_average >= fed[i].min_average, 'Federal results sorted by cutoff desc');
  }
  assert.strictEqual(
    filterFederalCutoffs(fedData, { system: 'federal', score: 0, stream: 'scientific' }).length, 0,
    'Score 0 matches nothing'
  );
  const top = filterFederalCutoffs(fedData, { system: 'federal', score: 101.5, stream: 'scientific' });
  assert(top.some((r) => r.college_en === 'College of Medicine'), 'A 101.5 student sees medicine');
  const krg = filterKRGCutoffs(krgData, { system: 'krg', score: 100, stream: 'scientific' });
  assert(krg.every((r) => r.stream === 'scientific'), 'KRG filter respects stream');

  // Gender: a male student never sees female-only rows and vice versa; "both" rows always show
  const male = filterFederalCutoffs(fedData, { system: 'federal', score: 100, stream: 'scientific', gender: 'male' });
  assert(male.every((r) => r.gender !== 'female'), 'male filter hides female-only');
  assert(male.some((r) => r.gender === 'both'), 'male filter keeps mixed rows');
  const female = filterFederalCutoffs(fedData, { system: 'federal', score: 100, stream: 'scientific', gender: 'female' });
  assert(female.every((r) => r.gender !== 'male'), 'female filter hides male-only');

  // Level (Federal + KRG)
  const inst = filterFederalCutoffs(fedData, { system: 'federal', score: 100, stream: 'scientific', level: 'institute' });
  assert(inst.length > 0 && inst.every((r) => r.level === 'institute'), 'institute filter');
  const col = filterFederalCutoffs(fedData, { system: 'federal', score: 100, stream: 'scientific', level: 'college' });
  assert(col.every((r) => r.level !== 'institute'), 'college filter');
  const krgInst = filterKRGCutoffs(krgData, { system: 'krg', score: 100, stream: 'scientific', level: 'institute' });
  assert(krgInst.length > 0 && krgInst.every((r) => r.level === 'institute'), 'KRG institute filter');

  // Alpha sort is deterministic
  const alpha = filterFederalCutoffs(fedData, { system: 'federal', score: 100, stream: 'literary', sort_by: 'alpha' });
  for (let i = 1; i < alpha.length; i++) {
    assert(alpha[i - 1].university.localeCompare(alpha[i].university) <= 0, 'alpha sort by university');
  }
});

// ---------- Scholarships ----------
suite('Scholarship curation', () => {
  const dafi = schData.find((s) => s.id === 'sch-003');
  assert(dafi, 'DAFI listing must exist');
  assert.strictEqual(dafi.status, 'discontinued', 'DAFI must be marked discontinued per UNHCR 2025-2026 Iraq policy');

  const turkiye = schData.find((s) => s.id === 'sch-001');
  assert(turkiye, 'Türkiye Bursları must exist');
  assert.strictEqual(turkiye.eligibility.max_age, 21, 'Türkiye Bursları undergraduate age cap must be 21');
  assert.strictEqual(turkiye.eligibility.min_gpa, 70, 'Türkiye Bursları min GPA must be 70%');

  const iylep = schData.find((s) => s.id === 'sch-007');
  assert(iylep, 'IYLEP must exist');
  assert.strictEqual(iylep.type, 'exchange', 'IYLEP must be categorized as exchange, not full degree scholarship');

  // Every open/upcoming listing with a dated deadline must be in the future relative to last_verified
  for (const s of schData) {
    if ((s.status === 'open' || s.status === 'upcoming') && s.deadline && ISO.test(s.deadline)) {
      assert(s.deadline >= s.last_verified, `${s.id}: ${s.status} listing has a deadline before its verification date`);
    }
  }
});

suite('Deadline-aware scholarship status', () => {
  const before = new Date(2025, 0, 10);
  const onDay = new Date(2025, 0, 15, 12);
  const after = new Date(2025, 0, 16);
  const s = { status: 'open', deadline: '2025-01-15' };
  assert(!isDeadlinePassed(s, before) && !isDeadlinePassed(s, onDay), 'Deadline day itself is still open');
  assert(isDeadlinePassed(s, after), 'Day after deadline is passed');
  assert.strictEqual(getEffectiveStatus(s, after), 'closed', 'Open + past deadline => closed');
  assert.strictEqual(getEffectiveStatus({ status: 'upcoming', deadline: '2025-01-15' }, after), 'closed');
  assert.strictEqual(getEffectiveStatus({ status: 'discontinued', deadline: '2025-01-15' }, after), 'discontinued');
  assert.strictEqual(getEffectiveStatus({ status: 'open', deadline: 'rolling' }, after), 'open', 'Non-date deadlines ignored');

  // Filter + sort use effective status
  const farFuture = new Date(2099, 0, 1);
  const openNow = filterScholarships(schData, { status: 'open' }, farFuture);
  assert.strictEqual(openNow.filter((x) => /^\d{4}-/.test(x.deadline ?? '')).length, 0,
    'No dated listing is "open" once its deadline has passed');
  const all = filterScholarships(schData, {}, before);
  const w = { open: 0, upcoming: 1, closed: 2, discontinued: 3 };
  for (let i = 1; i < all.length; i++) {
    assert(w[getEffectiveStatus(all[i - 1], before)] <= w[getEffectiveStatus(all[i], before)], 'Sorted by effective status');
  }
});

// ---------- URL state ----------
suite('Shareable URL state round-trips', () => {
  assert.deepStrictEqual(parseCheckerState(''), DEFAULT_CHECKER_STATE, 'Empty query => defaults');
  assert.strictEqual(serializeCheckerState(DEFAULT_CHECKER_STATE), '', 'Defaults => empty query');
  const state = {
    system: 'krg', score: '91.25', stream: 'scientific', subStream: 'bio',
    location: 'أربيل', studyType: 'government', channel: 'all', gender: 'female', level: 'institute'
  };
  assert.deepStrictEqual(parseCheckerState(serializeCheckerState(state)), state, 'Round-trip');
  const stateWithExtras = {
    ...state,
    search: 'طب',
    sortBy: 'closest',
    showReach: true
  };
  assert.deepStrictEqual(parseCheckerState(serializeCheckerState(stateWithExtras)), stateWithExtras, 'Round-trip with search/sort/reach');
  const junk = parseCheckerState('?sys=evil&stream=nope&sub=bio&g=robot&lvl=nope');
  assert.strictEqual(junk.system, 'federal', 'Unknown system ignored');
  assert.strictEqual(junk.stream, 'scientific', 'Unknown stream ignored');
  assert.strictEqual(junk.gender, 'both', 'Unknown gender ignored');
  assert.strictEqual(junk.level, 'all', 'Unknown level ignored');
  assert.strictEqual(parseCheckerState('?stream=literary&sub=bio').subStream, undefined, 'Sub-stream only for scientific');
});

// ---------- Translations ----------
suite('Translations complete in all languages', () => {
  const keys = Object.keys(ar).sort();
  for (const [name, dict] of [['ckb', ckb], ['kmr', kmr], ['en', en]]) {
    assert.deepStrictEqual(Object.keys(dict).sort(), keys, `${name} must have the same keys as ar`);
  }
  const placeholders = {
    resultsCount: ['count'], scholarshipsFound: ['count'], daysRemaining: ['days'], nearestProgram: ['score'],
    compositeBestOfApplied: ['score'], disclaimerText: ['year'], disclaimerShort: ['year'],
    footerDataSource: ['year', 'krgYear'], scoreOutOfRange: ['max'], enterScoreHint: ['max'],
    dataYearTag: ['year'], federalDataNote: ['year'], krgDataNote: ['year']
  };
  for (const [name, dict] of [['ar', ar], ['ckb', ckb], ['kmr', kmr], ['en', en]]) {
    for (const [k, v] of Object.entries(dict)) {
      assert(typeof v === 'string' && v.trim() !== '', `${name}.${k} must be non-empty`);
    }
    for (const [k, vars] of Object.entries(placeholders)) {
      for (const v of vars) assert(dict[k].includes(`{${v}}`), `${name}.${k} must contain {${v}}`);
    }
    assert(!/20\d\d-20\d\d/.test(dict.disclaimerText), `${name}.disclaimerText must not hardcode a year (comes from meta.json)`);
  }
});

suite('Language config, fallback chains and localized dates', () => {
  assert.deepStrictEqual([...LANGUAGES].sort(), Object.keys(LANG_CONFIG).sort(), 'LANGUAGES must list every configured language');
  for (const l of LANGUAGES) {
    const c = LANG_CONFIG[l];
    const chain = languageChain(l);
    assert.deepStrictEqual([...chain].sort(), [...LANGUAGES].sort(), `${l} fallback chain must cover every other language once`);
    assert.strictEqual(chain[0], l);
    assert.strictEqual(c.months.length, 12, `${l} needs 12 month names`);
    assert(c.loadingLabel.trim(), `${l} needs a loading label`);
    assert.strictEqual(c.dir, c.script === 'arab' ? 'rtl' : 'ltr', `${l} direction must match its script`);
    // Same-script languages are tried before other scripts
    const firstOther = chain.findIndex((x) => LANG_CONFIG[x].script !== c.script);
    assert(chain.slice(firstOther).every((x) => LANG_CONFIG[x].script !== c.script), `${l} chain must try same-script languages first`);
  }
  const v = { ar: 'عربي', ckb: 'کوردی', kmr: 'Kurdî', en: 'English' };
  for (const l of LANGUAGES) assert.strictEqual(pickLocalized(l, v), v[l]);
  assert.strictEqual(pickLocalized('kmr', { ar: 'عربي', en: 'English' }), 'English', 'Kurmanji falls back to Latin-script English');
  assert.strictEqual(pickLocalized('ckb', { ar: 'عربي', en: 'English' }), 'عربي', 'Sorani falls back to Arabic-script Arabic');
  assert.strictEqual(pickLocalized('en', { ar: 'عربي', en: '' }), 'عربي', 'empty strings count as missing');
  assert.strictEqual(pickLocalized('en', { ar: ['x'], en: [] })[0], 'x', 'empty arrays count as missing');
  assert.strictEqual(pickLocalized('ar', {}), undefined);
  assert.strictEqual(formatDate('2027-03-05', 'en'), 'March 5, 2027');
  assert.strictEqual(formatDate('2027-03-05', 'ckb'), '5 ئازار 2027');
  assert.strictEqual(formatDate('2027-12-31', 'kmr'), '31 Kanûna Pêşîn 2027');
  assert.strictEqual(formatDate('2027-01-01', 'ar'), '1 كانون الثاني 2027');
  assert.strictEqual(formatDate('TBA', 'en'), 'TBA');
});

suite('Every place name in the data has Kurdish and English translations', () => {
  const places = new Set([
    ...fedData.map((r) => r.governorate),
    ...krgData.map((r) => r.city),
    ...schData.map((s) => s.country)
  ]);
  for (const p of places) {
    assert(isKnownPlace(p), `Missing entry for "${p}" in src/lib/places.ts`);
    assert.notStrictEqual(localizePlace(p, 'kmr'), p, `Missing kmr (Latin) name for "${p}"`);
    assert.notStrictEqual(localizePlace(p, 'en'), p, `Missing en (English) name for "${p}"`);
    assert(localizePlace(p, 'ckb').trim() !== '', `Empty ckb name for "${p}"`);
    assert(localizePlace(p, 'en').trim() !== '', `Empty en name for "${p}"`);
    assert.strictEqual(localizePlace(p, 'ar'), p);
  }
});

suite('Search works across Arabic, Kurdish and Latin spellings', () => {
  assert.strictEqual(normalizeForSearch('كلية'), normalizeForSearch('کلیه'), 'Arabic kaf/yeh/teh-marbuta fold to Kurdish forms');
  assert.strictEqual(normalizeForSearch('أربيل'), normalizeForSearch('اربيل'), 'Alef variants fold');
  assert.strictEqual(normalizeForSearch('Hewlêr'), 'hewler', 'Latin accents and case fold');
  assert(matchesQuery('medicine baghdad', ['College of Medicine', 'Baghdad']), 'Multi-word query matches across fields');
  assert(!matchesQuery('dentistry', ['College of Medicine']), 'Non-matching query rejected');

  const base = { system: 'federal', score: MAX_SCORE_FEDERAL, stream: 'scientific' };
  const arabic = filterFederalCutoffs(fedData, { ...base, search: 'كلية الطب' });
  const kurdishKeyboard = filterFederalCutoffs(fedData, { ...base, search: 'کلیة الطب' });
  assert(arabic.length > 0, 'Arabic query finds medicine');
  assert.deepStrictEqual(kurdishKeyboard.map((r) => r.id), arabic.map((r) => r.id), 'Kurdish keyboard spelling finds the same rows');
  const soraniCity = filterFederalCutoffs(fedData, { ...base, search: 'بەغدا' });
  assert(soraniCity.length > 0 && soraniCity.every((r) => r.governorate === 'بغداد'), 'Sorani city name finds Baghdad rows');
  const soraniUni = filterFederalCutoffs(fedData, { ...base, search: 'زانکۆی مووسڵ' });
  assert(soraniUni.length > 0 && soraniUni.every((r) => (r.university_ku + r.college_ku).includes('مووسڵ')), 'Sorani university name matches Mosul rows');
  assert(soraniUni.some((r) => r.university_en === 'University of Mosul'), 'University of Mosul found by its Sorani name');
  const kmrCity = filterKRGCutoffs(krgData, { system: 'krg', score: 100, stream: 'scientific', search: 'hewler' });
  assert(kmrCity.length > 0, 'Kurmanji city name (no accents) finds Erbil rows');
  const enCity = filterKRGCutoffs(krgData, { system: 'krg', score: 100, stream: 'scientific', search: 'erbil' });
  assert(enCity.length > 0, 'English city name finds Erbil rows');
  const enGov = filterFederalCutoffs(fedData, { ...base, search: 'nineveh' });
  assert(enGov.length > 0 && enGov.every((r) => r.governorate === 'نينوى'), 'English governorate name finds Nineveh rows');
  const enSch = filterScholarships(schData, { search: 'Hungary tuition' });
  assert(enSch.some((s) => s.id === 'sch-002'), 'English country and covers keywords find Stipendium Hungaricum');
});

// ---------- Multi-channel, history and rule-based routes (Nov 2026) ----------
const extraFiles = meta.federal.extra_files ?? [];
const historyFiles = meta.federal.history ?? [];

suite(`Federal extra channel files load and merge cleanly (${extraFiles.map((e) => e.channel).join(', ') || 'none'})`, () => {
  const allIds = new Set(fedData.map((r) => r.id));
  for (const e of extraFiles) {
    assert(fs.existsSync(path.join(DATA_DIR, e.file)), `${e.file} must exist`);
    const rows = load(e.file);
    assert(rows.length > 100, `${e.file}: expected a full list`);
    for (const r of rows) {
      assert.strictEqual(r.channel, e.channel, `${r.id}: channel must be ${e.channel}`);
      assert.strictEqual(r.year, meta.federal.year, `${r.id}: year must match meta`);
      assert(validateScore(r.min_average, meta.federal.max_score), `${r.id}: average out of range`);
      assert(!allIds.has(r.id), `${r.id}: id collides with another file`);
      allIds.add(r.id);
      assert(r.university_en && r.college_en, `${r.id}: English names required`);
    }
  }
});

suite(`Federal history files are valid and match the current list (${historyFiles.map((h) => h.year_label).join(', ') || 'none'})`, () => {
  const datasets = [];
  for (const h of historyFiles) {
    assert(fs.existsSync(path.join(DATA_DIR, h.file)), `${h.file} must exist`);
    assert(Number.isInteger(h.year) && h.year < meta.federal.year, `${h.file}: history must be a prior year`);
    assert(/^\d{4}-\d{4}$/.test(h.year_label), `${h.file}: year_label`);
    const rows = load(h.file);
    assert(rows.length > 100, `${h.file}: expected a full list`);
    const ids = new Set(rows.map((r) => r.id));
    assert.strictEqual(ids.size, rows.length, `${h.file}: ids unique`);
    for (const r of rows) {
      assert.strictEqual(r.year, h.year, `${r.id}: year must match meta.history`);
      assert(validateScore(r.min_average, meta.federal.max_score), `${r.id}: average out of range`);
      assert(r.university && r.college && r.governorate, `${r.id}: names required`);
    }
    datasets.push({ info: h, rows });
  }
  if (datasets.length === 0) return;
  const history = buildHistory(datasets);
  const cov = coverage(fedData, history);
  console.log(`    history coverage of current rows: ${(cov * 100).toFixed(1)}%`);
  assert(cov >= 0.7, `At least 70% of current programmes should match a prior year (got ${(cov * 100).toFixed(1)}%)`);

  const baghdadMedicine = fedData.find((r) => r.university_en === 'University of Baghdad' && r.college_en === 'College of Medicine' && !r.department);
  assert(baghdadMedicine, 'Baghdad Medicine row exists');
  const trend = getTrend(baghdadMedicine, history);
  assert(trend && trend.previous && trend.previous.year === meta.federal.year - 1, 'Baghdad Medicine has last-year data');
  assert(trend.series.length >= 2, 'Baghdad Medicine has at least two prior years');
  assert(typeof trend.delta === 'number' && Math.abs(trend.delta) < 5, 'delta is a small number');
  assert.strictEqual(programKey(baghdadMedicine), programKey({ ...baghdadMedicine, university: 'جامعة  بغداد', college: 'كلية الطب ' }), 'programme key folds spacing');
  assert.strictEqual(getTrend(baghdadMedicine, null), null, 'no history → null');
});

suite('Federal rules file (evening / private minimums) is complete', () => {
  if (!meta.federal.rules) return;
  const rules = load(meta.federal.rules.file);
  assert.strictEqual(rules.year, meta.federal.year, 'rules year matches current year');
  assert(/^https?:\/\//.test(rules.source_url) && ISO.test(rules.published));
  assert(rules.routes.length >= 30 && rules.private_medical.length >= 20, 'tables look complete');
  const ids = new Set();
  for (const r of [...rules.routes, ...rules.private_medical]) {
    assert(!ids.has(r.id), `duplicate rule id ${r.id}`);
    ids.add(r.id);
    for (const k of ['ar', 'en', 'ckb', 'kmr']) assert(typeof r[k] === 'string' && r[k].trim(), `${r.id}: ${k} name`);
  }
  for (const r of rules.routes) {
    for (const key of ['gov_morning', 'gov_evening', 'private_morning', 'private_evening']) {
      assert(r[key] && typeof r[key] === 'object', `${r.id}: ${key}`);
      for (const [stream, v] of Object.entries(r[key])) {
        assert(['scientific', 'literary'].includes(stream) && Number.isFinite(v) && v >= 40 && v <= 100, `${r.id}: ${key}.${stream}`);
      }
    }
    assert(Object.keys(r.gov_evening).length > 0, `${r.id}: needs at least one stream`);
  }
  for (const m of rules.private_medical) {
    assert(m.morning >= 50 && m.morning <= 100, `${m.id}: morning`);
    assert(m.evening === null || (m.evening >= 50 && m.evening <= m.morning), `${m.id}: evening`);
  }
  const medicine = rules.private_medical.find((m) => m.id === 'medicine');
  assert(medicine && medicine.morning === 95, 'private medicine minimum is 95');
});

suite('Smart Wishlist Form Advisor, dynamic localization & .ics Calendar export', () => {
  const sampleKrg = krgData[0];
  const wishItemLow = {
    id: 'krg-009',
    type: 'krg',
    title: 'Law',
    subtitle: 'UoD',
    score: 78.4,
    raw: krgData.find((r) => r.id === 'krg-009') || sampleKrg,
    addedAt: 1
  };
  const wishItemHigh = {
    id: 'krg-001',
    type: 'krg',
    title: 'Medicine',
    subtitle: 'UoD',
    score: 98.4,
    raw: sampleKrg,
    addedAt: 2
  };

  // Dynamic localization across ar / ckb / kmr / en
  const locAr = localizeWishlistItem(wishItemHigh, 'ar');
  const locCkb = localizeWishlistItem(wishItemHigh, 'ckb');
  const locKmr = localizeWishlistItem(wishItemHigh, 'kmr');
  const locEn = localizeWishlistItem(wishItemHigh, 'en');
  assert.strictEqual(locAr.title, sampleKrg.college, 'Arabic wishlist title');
  assert.strictEqual(locCkb.title, sampleKrg.college_ku, 'Sorani wishlist title');
  assert.strictEqual(locKmr.title, sampleKrg.college_en, 'Kurmanji wishlist title');
  assert.strictEqual(locEn.title, sampleKrg.college_en, 'English wishlist title');
  assert.strictEqual(locEn.location, 'Duhok', 'English wishlist location');

  // Form analysis detects priority inversion when 78.4% is placed above 98.4%
  const badOrder = analyzeWishlistForm([wishItemLow, wishItemHigh], 96.0);
  assert.strictEqual(badOrder.inversions.length, 1, 'Detects lower-cutoff choice ranked above higher-cutoff choice');

  const goodOrder = analyzeWishlistForm([wishItemHigh, wishItemLow], 96.0);
  assert.strictEqual(goodOrder.inversions.length, 0, 'High-to-low cutoff order has 0 inversions');
  assert.strictEqual(goodOrder.safeCount, 1, '78.4% is safe for a 96.0% student');
  assert.strictEqual(goodOrder.needsSafetyNet, false, 'Has at least one safe choice');

  // Scholarship GPA & Age filter + .ics generation
  const highGpaMatches = filterScholarships(schData, { student_gpa: 95, student_age: 19 });
  const lowGpaMatches = filterScholarships(schData, { student_gpa: 68, student_age: 19 });
  assert(highGpaMatches.length > lowGpaMatches.length, 'Higher GPA qualifies for more scholarships');
  assert(lowGpaMatches.every((s) => !s.eligibility.min_gpa || s.eligibility.min_gpa <= 68), 'GPA filter hides higher-GPA scholarships');

  const datedScholarship = schData.find((s) => s.deadline && /^\d{4}-\d{2}-\d{2}$/.test(s.deadline));
  assert(datedScholarship, 'At least one scholarship has an ISO deadline');
  const ics = buildScholarshipIcs(datedScholarship, datedScholarship.name_ar, datedScholarship.notes_ar);
  assert(ics && ics.includes('BEGIN:VCALENDAR') && ics.includes('BEGIN:VALARM') && ics.includes('TRIGGER:-P7D'), 'Valid .ics calendar file with 7-day reminder');
  const est = schData.find((s) => s.deadline_estimated && s.deadline && /^\d{4}-\d{2}-\d{2}$/.test(s.deadline));
  assert(est, 'At least one scholarship has an estimated deadline');
  const estIcs = buildScholarshipIcs(est, est.name_ar, undefined, 'موعد متوقع');
  assert(/SUMMARY:.*موعد متوقع/.test(estIcs), 'Estimated deadline is labelled as expected in the calendar title');
  assert(estIcs.includes('check the official page'), 'Estimated deadline tells the student to confirm on the official page');
  const confirmed = schData.find((s) => !s.deadline_estimated && s.deadline && /^\d{4}-\d{2}-\d{2}$/.test(s.deadline));
  if (confirmed) assert(!buildScholarshipIcs(confirmed, 'x', undefined, 'موعد متوقع').includes('موعد متوقع'), 'Confirmed deadlines are not labelled as expected');
});

suite('Official form checks: choice count, technical minimum, wrong stream / gender / channel', () => {
  const form = meta.federal.form;
  assert(form, 'meta.federal.form is set');
  assert(/^\d{4}-\d{4}$/.test(form.year_label) && ISO.test(form.published) && /^https?:\/\//.test(form.source_url));
  assert(form.min_choices.scientific === 50 && form.min_choices.literary === 25 && form.min_technical === 10, '2026-2027 form rules');

  const toItem = (r) => ({ id: r.id, type: 'federal', title: r.college, subtitle: r.university, score: r.min_average, raw: r, addedAt: 0 });
  const sci = fedData.filter((r) => r.stream === 'scientific' && r.gender === 'both' && r.channel === 'general');
  const inst = sci.find((r) => r.level === 'institute');
  const techCollege = sci.find((r) => r.level === 'college' && /التقنية/.test(r.university));
  const plainCollege = sci.find((r) => r.level === 'college' && !/التقنية/.test(r.university));
  assert(isTechnicalChoice(toItem(inst)) && isTechnicalChoice(toItem(techCollege)), 'institutes and polytechnic colleges count as technical');
  assert(!isTechnicalChoice(toItem(plainCollege)), 'an ordinary college is not technical');

  const items = [toItem(plainCollege), toItem(techCollege), toItem(inst)];
  const ok = checkForm(items, { stream: 'scientific', gender: 'male', channel: 'general' }, form);
  assert.deepStrictEqual(ok.progress, { choices: 3, requiredChoices: 50, technical: 2, requiredTechnical: 10 });
  assert(!ok.mixedSystems && ok.wrongStream.length === 0 && ok.wrongGender.length === 0 && ok.wrongChannel.length === 0);
  assert.strictEqual(checkForm(items, {}, form).progress, null, 'no stream: no progress (rule unknown)');
  assert.strictEqual(checkForm(items, { stream: 'vocational' }, form).progress, null, 'no published rule for vocational');

  const lit = fedData.find((r) => r.stream === 'literary');
  const femaleOnly = fedData.find((r) => r.gender === 'female');
  const dist = load(meta.federal.extra_files.find((f) => f.channel === 'distinguished').file).find((r) => r.channel === 'distinguished');
  const krgItem = { id: krgData[0].id, type: 'krg', title: 'x', subtitle: 'y', score: 90, raw: krgData[0], addedAt: 0 };
  const bad = checkForm([toItem(plainCollege), toItem(lit), toItem(femaleOnly), toItem(dist), krgItem], { stream: 'scientific', gender: 'male', channel: 'general' }, form);
  assert(bad.wrongStream.includes(2), 'literary choice flagged for a scientific student');
  assert(bad.wrongGender.includes(3), 'female-only programme flagged for a male student');
  assert(bad.wrongChannel.includes(4), 'distinguished seat flagged on the general channel');
  assert(bad.mixedSystems, 'Federal + KRG in one plan flagged');
  assert(!checkForm([toItem(dist)], { stream: dist.stream, channel: 'distinguished' }, form).wrongChannel.length, 'distinguished student may keep distinguished seats');

  assert(officialChoiceName(toItem(plainCollege)).startsWith(plainCollege.university), 'Federal form names are Arabic');
  assert(officialChoiceName(krgItem).startsWith(krgData[0].university_ku), 'Zankoline form names are Sorani');
});

suite('Plans: migration from the old wishlist, add order, copy, switch, delete', () => {
  const mem = new Map();
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  };
  try {
    const a = { id: 'a', type: 'federal', title: 'A', subtitle: '', score: 90, raw: {}, addedAt: 1 };
    const b = { id: 'b', type: 'federal', title: 'B', subtitle: '', score: 80, raw: {}, addedAt: 2 };
    const c = { id: 'c', type: 'federal', title: 'C', subtitle: '', score: 70, raw: {}, addedAt: 3 };
    mem.set('renisan_wishlist', JSON.stringify([a]));
    assert.deepStrictEqual(wishlistStore.getWishlist().map((x) => x.id), ['a'], 'old wishlist carried over');
    wishlistStore.toggleWishlist(b);
    assert(!mem.has('renisan_wishlist') && mem.has('renisan_plans'), 'migrated to the plans store');
    assert.deepStrictEqual(wishlistStore.getWishlist().map((x) => x.id), ['a', 'b'], 'new saves go to the end of the form');
    wishlistStore.toggleWishlist(c);
    wishlistStore.moveWishlistItemTo('c', 1);
    assert.deepStrictEqual(wishlistStore.getWishlist().map((x) => x.id), ['c', 'a', 'b'], 'move to position');
    wishlistStore.moveWishlistItemTo('c', 99);
    assert.deepStrictEqual(wishlistStore.getWishlist().map((x) => x.id), ['a', 'b', 'c'], 'position is clamped');

    const first = wishlistStore.getPlans().active;
    assert(wishlistStore.createPlan('Backup', true));
    assert.strictEqual(wishlistStore.getWishlist().length, 3, 'copy keeps the choices');
    wishlistStore.removeWishlistItem('a');
    wishlistStore.setActivePlan(first);
    assert.strictEqual(wishlistStore.getWishlist().length, 3, 'editing the copy leaves the original alone');
    assert(!wishlistStore.isWishlisted('zzz') && wishlistStore.isWishlisted('a'));
    wishlistStore.createPlan('Empty', false);
    assert.strictEqual(wishlistStore.getWishlist().length, 0, 'new empty plan is active');
    assert.strictEqual(wishlistStore.getPlans().plans.length, 3);
    wishlistStore.deletePlan(wishlistStore.getPlans().active);
    assert.strictEqual(wishlistStore.getPlans().plans.length, 2, 'plan deleted');
    assert(wishlistStore.getPlans().plans.some((p) => p.id === wishlistStore.getPlans().active), 'active plan still exists');

    assert.strictEqual(parsePlanStore({ plans: [] }), null, 'empty store rejected');
    assert.strictEqual(parsePlanStore('junk'), null, 'junk rejected');
    const repaired = parsePlanStore({ active: 'missing', plans: [{ id: 'p', name: 'x', items: [null, a] }] });
    assert(repaired.active === 'p' && repaired.plans[0].items.length === 1, 'bad active id and bad items repaired');

    // Profile: kept on the device, cleaned on read
    profileStore.updateProfile({ score: '92.5', stream: 'scientific', subStream: 'bio', gender: 'female' });
    assert.strictEqual(profileStore.getProfile().score, '92.5');
    assert(profileStore.hasProfile());
    profileStore.updateProfile({ score: undefined });
    assert.strictEqual(profileStore.getProfile().score, undefined, 'clearing the score removes it');
    assert.strictEqual(profileStore.getProfile().stream, 'scientific', 'other fields stay');
    profileStore.clearProfile();
    assert(!profileStore.hasProfile() && !mem.has('renisan_profile'), 'forget removes everything');
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
  const clean = sanitizeProfile({ system: 'mars', score: '9'.repeat(40), stream: 'literary', subStream: 'bio', gender: 'x', birthYear: 1800 });
  assert.deepStrictEqual(clean, { stream: 'literary' }, 'invalid profile fields dropped; sub-stream only for scientific');
  const today = new Date('2026-11-20');
  assert.strictEqual(ageFromBirthYear(birthYearFromAge(18, today), today), 18);
  assert.strictEqual(ageFromBirthYear(birthYearFromAge(18, today), new Date('2027-11-20')), 19, 'age grows with the year');
});

suite('Opportunity pipeline: validator, discovery queue, review and watcher', () => {
  const today = '2026-11-20';
  const existing = schData.map((x) => ({ id: x.id, name: x.name, application_url: x.application_url }));
  // Every live listing must pass the same gate new ones go through
  for (const x of schData) {
    const r = validateScholarship(x, { existing, today: x.last_verified });
    assert.deepStrictEqual(r.errors, [], `${x.id}: ${r.errors.join('; ')}`);
  }

  const good = {
    name: 'Example Government Scholarship', name_ar: 'منحة مثال', name_ckb: 'سکۆلەرشیپی نموونە', name_kmr: 'Bursa Mînak',
    country: 'تركيا', country_flag: '🇹🇷', provider: 'Example Ministry',
    degree_levels: ['bachelor'], type: 'full_scholarship',
    eligibility: { nationalities: ['Iraqi'], refugee_idp_eligible: false, min_gpa: 75, max_age: null, language_requirements: [], must_return: null },
    application_url: 'https://scholarship.example.gov/apply', deadline: '2027-03-01', deadline_estimated: true,
    deadline_note: 'متوقع', deadline_note_en: 'Expected from last cycle', deadline_note_ckb: 'چاوەڕوانکراو', deadline_note_kmr: 'Tê çaverêkirin',
    covers: ['الرسوم'], covers_en: ['Tuition'], covers_ckb: ['کرێ'], covers_kmr: ['Heq'], status: 'upcoming',
    notes_ar: 'ملاحظة', notes_en: 'Note', notes_ckb: 'تێبینی', notes_kmr: 'Nîşe',
    confidence: 'high', evidence: { source_url: 'https://scholarship.example.gov/apply', quote: 'Open to Iraq', iraq_eligibility_basis: 'country list' }
  };
  const rec = toRecord(good);
  assert(!('confidence' in rec) && !('evidence' in rec), 'candidate-only fields stripped');
  assert(!('max_age' in rec.eligibility) && !('must_return' in rec.eligibility) && !('language_requirements' in rec.eligibility), 'nulls / empty lists dropped');
  assert.deepStrictEqual(validateScholarship(rec, { existing, today }).errors, []);

  const bad = (patch) => validateScholarship({ ...rec, ...patch }, { existing, today }).errors;
  assert(bad({ application_url: 'https://www.opportunitydesk.org/x' }).some((e) => e.includes('repost')), 'repost sites refused');
  assert(bad({ application_url: 'http://scholarship.example.gov' }).some((e) => e.includes('https')), 'plain http refused');
  assert(bad({ deadline: '2026-01-01' }).some((e) => e.includes('passed')), 'upcoming with a past deadline refused');
  assert(bad({ eligibility: { ...rec.eligibility, nationalities: ['Egyptian'] } }).some((e) => e.includes('Iraqi')), 'Iraqis must be eligible');
  assert(bad({ name_kmr: '' }).some((e) => e.includes('name_kmr')), 'all four languages required');
  assert(bad({ application_url: schData[0].application_url + '/' }).some((e) => e.includes('duplicate')), 'same URL = duplicate');
  assert(isAggregator('https://t.me/somechannel') && !isAggregator('https://www.daad.de/en/'), 'aggregator detection');
  assert(nameSimilarity('Chevening Scholarships', 'Chevening Scholarship (UK)') >= 0.6, 'name similarity');
  assert(findDuplicate({ name: 'Türkiye Bursları scholarship', application_url: 'https://x.example/y' }, existing), 'name-based duplicate');
  assert(validateScholarship({ ...rec, country: 'Narnia' }, { today }).warnings.some((w) => w.includes('places.ts')), 'unknown country warns');

  // Strict-schema rules: every object closed and fully required
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.strictEqual(node.additionalProperties, false, 'objects must be closed');
      assert.deepStrictEqual([...node.required].sort(), Object.keys(node.properties).sort(), 'all fields required');
    }
    Object.values(node).forEach(walk);
  };
  walk(EXTRACT_SCHEMA);

  // Queue: new ones added, duplicates / rejected / already-queued skipped
  const queue = { updated: today, items: [] };
  const dupOfListed = { ...good, name: schData[1].name, application_url: schData[1].application_url };
  const rejectedOne = { ...good, name: 'Rejected Fund', application_url: 'https://rejected.example.org/' };
  const first = mergeCandidates(queue, [good, dupOfListed, rejectedOne], existing, [{ name: 'Rejected Fund', application_url: 'https://rejected.example.org', reason: 'fee', date: today }], today);
  assert.strictEqual(first.added.length, 1, 'only the genuinely new one is queued');
  assert.strictEqual(first.skipped.length, 2);
  assert.strictEqual(first.added[0].status, 'pending');
  assert.strictEqual(first.added[0].needs_language_review, true);
  assert.strictEqual(first.added[0].cid, candidateId(good.application_url, good.name));
  const again = mergeCandidates(first.queue, [good], existing, [], today);
  assert.strictEqual(again.added.length, 0, 'same candidate not queued twice');

  // Review: ids continue the sequence; listing gets a verification stamp
  assert.strictEqual(nextScholarshipId([{ id: 'sch-009' }, { id: 'sch-016' }, { id: 'x' }]), 'sch-017');
  const listing = toListing(rec, 'sch-017', today, 'Editor');
  assert.strictEqual(Object.keys(listing)[0], 'id');
  assert(listing.last_verified === today && listing.verified_by === 'Editor');

  // Watcher: page fingerprint ignores markup / scripts / clock times, date checks flag the right things
  assert.strictEqual(pageFingerprint('<p>Deadline 1 March</p><script>x=1</script>'), pageFingerprint('<div>Deadline   1 March</div><script>x=2</script> 10:42'));
  assert.notStrictEqual(pageFingerprint('<p>Deadline 1 March</p>'), pageFingerprint('<p>Deadline 15 March</p>'));
  const kinds = (x) => dateFindings(x, today).map((f) => f.kind);
  assert(kinds({ status: 'open', deadline: '2026-11-01', last_verified: today }).includes('deadline-passed'));
  assert(kinds({ status: 'upcoming', deadline: '2026-12-20', deadline_estimated: true, last_verified: today }).includes('check-announcement'));
  assert(kinds({ status: 'upcoming', last_verified: '2026-08-01' }).includes('stale'));
  assert.deepStrictEqual(kinds({ status: 'discontinued', last_verified: '2020-01-01' }), [], 'discontinued listings are left alone');

  // Auto-expire: closes confirmed passed deadlines only; leaves estimated dates for human verification
  const sweep = autoExpireListings([
    { id: 'a', status: 'open', deadline: '2026-11-01', deadline_estimated: false },
    { id: 'b', status: 'upcoming', deadline: '2026-11-01', deadline_estimated: true },
    { id: 'c', status: 'open', deadline: '2026-12-01', deadline_estimated: false }
  ], today);
  assert.deepStrictEqual(sweep.expiredIds, ['a'], 'only confirmed past deadline is auto-expired');
  assert.strictEqual(sweep.list[0].status, 'closed');
  assert.strictEqual(sweep.list[1].status, 'upcoming', 'estimated past deadline awaits human check');
  assert.strictEqual(sweep.list[2].status, 'open');

  // Harvester: RSS 2.0, Atom, ReliefWeb JSON, relevance filter, deduplication & leads prompt
  const rssItems = parseRssFeed(`<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[Fully Funded Master's Scholarship for International Students]]></title><link>https://example.org/sch-1</link><description>Open to Iraq and Middle East applicants.</description><pubDate>Thu, 19 Nov 2026 00:00:00 GMT</pubDate></item>
    <item><title>US Citizens Only Local Grant</title><link>https://example.org/us-only</link><description>For U.S. citizens only.</description></item>
  </channel></rss>`);
  assert.strictEqual(rssItems.length, 2, 'parses RSS items');
  assert(isIraqRelevantLead(rssItems[0], 'scholars4dev-rss'), 'keeps Iraq-relevant scholarship lead');
  assert(!isIraqRelevantLead(rssItems[1], 'scholars4dev-rss'), 'filters out US-citizens-only lead');

  const atomItems = parseRssFeed(`<feed><entry><title>Fulbright Iraq Exchange 2027</title><link href="https://iq.usembassy.gov/fulbright-2027/"/><summary>Apply now</summary></entry></feed>`);
  assert.strictEqual(atomItems.length, 1);
  assert(isIraqRelevantLead(atomItems[0], 'us-embassy-iraq-rss'), 'official Iraq feed matches on opp keyword');

  const rwItems = parseReliefWebResponse({
    data: [{ fields: { title: 'Youth Leadership Training Fellowship', url: 'https://reliefweb.int/training/123', body: 'Free training in Erbil', date: { created: '2026-11-19' } } }]
  });
  assert.strictEqual(rwItems.length, 1);
  assert(isIraqRelevantLead(rwItems[0], 'reliefweb-iraq-training'));

  const dedup = dedupeLeads([
    { title: 'New Scholarship for Iraq', url: 'https://provider.example/new', summary: 'desc', sourceId: 'scholars4dev-rss', sourceName: 'S4D', tier: 'lead' },
    { title: 'Türkiye Bursları', url: schData[0].application_url, summary: 'dup', sourceId: 'scholars4dev-rss', sourceName: 'S4D', tier: 'lead' }
  ], { existing, rejected: [], seenLeads: [], today });
  assert.strictEqual(dedup.added.length, 1);
  assert.strictEqual(dedup.skipped, 1);
  assert(buildLeadsResearchPrompt(today, dedup.added, existing, []).includes('https://provider.example/new'));
});

suite('Explainable scholarship eligibility matcher, deadline buckets & multi-ICS export', () => {
  const today = new Date('2026-11-20T12:00:00Z');
  const turkiye = schData.find((s) => s.id === 'sch-001'); // bachelor, min_gpa 70, max_age 21, deadline 2027-02-20
  const ugrad = schData.find((s) => s.id === 'sch-008'); // requires_enrolled_undergrad: true
  const chevening = schData.find((s) => s.id === 'sch-013'); // masters, work_experience_years: 2, must_return: true
  const dafi = schData.find((s) => s.id === 'sch-003'); // discontinued

  assert(!hasEligibilityProfile({}), 'empty profile detected');
  assert(hasEligibilityProfile({ educationLevel: 'grade12' }), 'non-empty profile detected');

  // Strong Grade-12 student -> GO for Türkiye Bursları, NO_GO for Global UGRAD (needs undergrad) & Chevening (masters + 2y exp)
  const g12 = { educationLevel: 'grade12', gpa: 92, birthYear: 2008, workExperienceYears: 0, englishLevel: 'basic' };
  const mTurkiye = matchScholarship(turkiye, g12, today);
  assert.strictEqual(mTurkiye.verdict, 'GO', '19-year-old G12 student with 92% is GO for Türkiye Bursları');
  assert(mTurkiye.passed.some((r) => r.code === 'gpa_ok') && mTurkiye.passed.some((r) => r.code === 'age_ok'));

  const mUgrad = matchScholarship(ugrad, g12, today);
  assert.strictEqual(mUgrad.verdict, 'NO_GO', 'G12 student is NO_GO for Global UGRAD');
  assert(mUgrad.failed.some((r) => r.code === 'undergrad_enrolled_required'));

  const mChev = matchScholarship(chevening, g12, today);
  assert.strictEqual(mChev.verdict, 'NO_GO', 'G12 student is NO_GO for Chevening');
  assert(mChev.failed.some((r) => r.code === 'work_exp_fail') && mChev.failed.some((r) => r.code === 'degree_fail'));

  // Missing GPA -> MAYBE; Failed GPA + missing age -> NO_GO (failure beats unknown)
  assert.strictEqual(matchScholarship(turkiye, { educationLevel: 'grade12', birthYear: 2008 }, today).verdict, 'MAYBE');
  assert.strictEqual(matchScholarship(turkiye, { educationLevel: 'grade12', gpa: 60 }, today).verdict, 'NO_GO', 'failed GPA beats missing age');

  // Borderline age (±1 yr from birthYear at 2027 deadline: 2027 - 2006 = 21 == max_age) -> MAYBE, never GO
  const borderline = matchScholarship(turkiye, { educationLevel: 'grade12', gpa: 90, birthYear: 2006 }, today);
  assert.strictEqual(borderline.verdict, 'MAYBE', 'borderline birthYear returns MAYBE');
  assert(borderline.missing.some((r) => r.code === 'age_borderline'));

  // Graduate with 2+ years experience -> GO for Chevening; unwilling to return -> NO_GO
  const grad = { educationLevel: 'graduate', gpa: 85, birthYear: 1999, workExperienceYears: 3, englishLevel: 'ielts_toefl', willingToReturn: true };
  assert.strictEqual(matchScholarship(chevening, grad, today).verdict, 'GO');
  assert.strictEqual(matchScholarship(chevening, { ...grad, willingToReturn: false }, today).verdict, 'NO_GO');
  assert.strictEqual(matchScholarship(dafi, grad, today).verdict, 'NO_GO', 'discontinued is always NO_GO');

  // Deadline buckets & multi-ICS export
  assert.strictEqual(getDeadlineBucket({ status: 'open', deadline: '2026-11-24', deadline_estimated: false }, today), 'urgent');
  assert.strictEqual(getDeadlineBucket({ status: 'open', deadline: '2026-12-10', deadline_estimated: false }, today), 'soon');
  assert.strictEqual(getDeadlineBucket({ status: 'open', deadline: '2027-02-20', deadline_estimated: false }, today), 'upcoming');
  assert.strictEqual(getDeadlineBucket({ status: 'upcoming', deadline: '2027-02-20', deadline_estimated: true }, today), 'estimated');
  assert.strictEqual(getDeadlineBucket({ status: 'open', deadline: '2026-11-01', deadline_estimated: false }, today), 'closed');
  assert(getDaysUntilDeadline({ status: 'open', deadline: '2026-11-25' }, today) >= 5);

  const multiIcs = buildMultiScholarshipIcs([
    { scholarship: turkiye, localizedTitle: turkiye.name },
    { scholarship: chevening, localizedTitle: chevening.name }
  ], 'expected');
  assert(multiIcs && (multiIcs.match(/BEGIN:VEVENT/g) || []).length === 2, 'multi-ICS exports 2 VEVENT blocks');
  assert(multiIcs.includes('TRIGGER:-P7D') && multiIcs.includes('TRIGGER:-P2D'), 'includes 7d and 2d alarms');

  // Wishlist item metadata update (stage + note)
  const mem = new Map();
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  };
  try {
    wishlistStore.toggleWishlist({ id: 'sch-001', type: 'scholarship', title: 'TB', subtitle: 'YTB', raw: turkiye, addedAt: 1 });
    wishlistStore.updateWishlistItemMeta('sch-001', { stage: 'preparing', note: 'Need transcript' });
    const saved = wishlistStore.getWishlist().find((x) => x.id === 'sch-001');
    assert.strictEqual(saved.stage, 'preparing');
    assert.strictEqual(saved.note, 'Need transcript');
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});

if (failed > 0) {
  console.error(`--- ${failed} TEST SUITE(S) FAILED (${suites} passed) ---`);
  process.exit(1);
}
console.log(`--- ALL ${suites} TEST SUITES PASSED ---`);
