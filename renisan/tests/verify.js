// Renisan verification tests.
// Imports the real TypeScript sources (Node >= 22.18 / 23.6 strips types natively),
// so these tests exercise the code that ships rather than copies of it.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeScoreInput, computeKRGComposite, validateScore, MAX_SCORE_FEDERAL, MAX_SCORE_KRG } from '../src/lib/normalizer.ts';
import { filterFederalCutoffs, filterKRGCutoffs, filterScholarships, getUniqueGovernorates } from '../src/lib/search.ts';
import { getEffectiveStatus, isDeadlinePassed } from '../src/lib/status.ts';
import { parseCheckerState, serializeCheckerState, DEFAULT_CHECKER_STATE } from '../src/lib/url-state.ts';
import { localizePlace, isKnownPlace } from '../src/lib/places.ts';
import { normalizeForSearch, matchesQuery } from '../src/lib/text.ts';
import { fillTemplate, formatAverage } from '../src/lib/format.ts';
import { ar } from '../src/lib/translations/ar.ts';
import { ckb } from '../src/lib/translations/ckb.ts';
import { kmr } from '../src/lib/translations/kmr.ts';

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
  assert(krgData.length >= 20, 'KRG data should have substantial entries');
  assert(schData.length >= 12, 'Scholarships should have at least 12 verified opportunities');
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
    assert(s.name_ckb && s.name_kmr, `${s.id}: Kurdish names required`);
    assert(Array.isArray(s.covers) && s.covers.length > 0, `${s.id}: covers required`);
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

// ---------- KRG composite ----------
suite('KRG composite formula', () => {
  assert.strictEqual(computeKRGComposite(80, 90, 90), 82, '80*0.8 + 90*0.1 + 90*0.1 = 82');
  assert.strictEqual(computeKRGComposite(85, 60, 60), 85, 'Best-of protection keeps G12 when composite is lower');
  assert.strictEqual(computeKRGComposite(90), 90, 'Missing G10/G11 falls back to G12');
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

  // Level
  const inst = filterFederalCutoffs(fedData, { system: 'federal', score: 100, stream: 'scientific', level: 'institute' });
  assert(inst.length > 0 && inst.every((r) => r.level === 'institute'), 'institute filter');
  const col = filterFederalCutoffs(fedData, { system: 'federal', score: 100, stream: 'scientific', level: 'college' });
  assert(col.every((r) => r.level !== 'institute'), 'college filter');

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
  for (const [name, dict] of [['ckb', ckb], ['kmr', kmr]]) {
    assert.deepStrictEqual(Object.keys(dict).sort(), keys, `${name} must have the same keys as ar`);
  }
  const placeholders = {
    resultsCount: ['count'], scholarshipsFound: ['count'], daysRemaining: ['days'], nearestProgram: ['score'],
    compositeBestOfApplied: ['score'], disclaimerText: ['year'], disclaimerShort: ['year'],
    footerDataSource: ['year', 'krgYear'], scoreOutOfRange: ['max'], enterScoreHint: ['max'],
    dataYearTag: ['year'], federalDataNote: ['year'], krgDataNote: ['year']
  };
  for (const [name, dict] of [['ar', ar], ['ckb', ckb], ['kmr', kmr]]) {
    for (const [k, v] of Object.entries(dict)) {
      assert(typeof v === 'string' && v.trim() !== '', `${name}.${k} must be non-empty`);
    }
    for (const [k, vars] of Object.entries(placeholders)) {
      for (const v of vars) assert(dict[k].includes(`{${v}}`), `${name}.${k} must contain {${v}}`);
    }
    assert(!/20\d\d-20\d\d/.test(dict.disclaimerText), `${name}.disclaimerText must not hardcode a year (comes from meta.json)`);
  }
});

suite('Every place name in the data has Kurdish translations', () => {
  const places = new Set([
    ...fedData.map((r) => r.governorate),
    ...krgData.map((r) => r.city),
    ...schData.map((s) => s.country)
  ]);
  for (const p of places) {
    assert(isKnownPlace(p), `Missing entry for "${p}" in src/lib/places.ts`);
    assert.notStrictEqual(localizePlace(p, 'kmr'), p, `Missing kmr (Latin) name for "${p}"`);
    assert(localizePlace(p, 'ckb').trim() !== '', `Empty ckb name for "${p}"`);
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
});

if (failed > 0) {
  console.error(`--- ${failed} TEST SUITE(S) FAILED (${suites} passed) ---`);
  process.exit(1);
}
console.log(`--- ALL ${suites} TEST SUITES PASSED ---`);
