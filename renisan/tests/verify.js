// Renisan verification tests.
// Imports the real TypeScript sources (Node >= 22.18 / 23.6 strips types natively),
// so these tests exercise the code that ships rather than copies of it.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeScoreInput, computeKRGComposite, validateScore } from '../src/lib/normalizer.ts';
import { filterFederalCutoffs, filterKRGCutoffs, filterScholarships } from '../src/lib/search.ts';
import { getEffectiveStatus, isDeadlinePassed } from '../src/lib/status.ts';
import { parseCheckerState, serializeCheckerState, DEFAULT_CHECKER_STATE } from '../src/lib/url-state.ts';
import { ar } from '../src/lib/translations/ar.ts';
import { ckb } from '../src/lib/translations/ckb.ts';
import { kmr } from '../src/lib/translations/kmr.ts';

let suites = 0;
function suite(name, fn) {
  fn();
  suites++;
  console.log(`✓ ${name}`);
}

console.log('--- Starting Renisan Verification Tests ---');

// ---------- Data ----------
const load = (f) => JSON.parse(fs.readFileSync(path.resolve('public/data', f), 'utf8'));
const fedData = load('cutoffs-federal-2024.json');
const krgData = load('cutoffs-krg-2024.json');
const schData = load('scholarships.json');

suite(`Datasets load (${fedData.length} federal, ${krgData.length} KRG, ${schData.length} scholarships)`, () => {
  assert(fedData.length > 50, 'Federal data should have substantial entries');
  assert(krgData.length >= 20, 'KRG data should have substantial entries');
  assert(schData.length >= 10, 'Scholarships should have at least 10 verified opportunities');
});

suite('Dataset integrity (unique ids, scores in range, valid enums)', () => {
  for (const [name, rows, scoreKey] of [
    ['federal', fedData, 'min_average'],
    ['krg', krgData, 'min_composite_score']
  ]) {
    const ids = new Set(rows.map((r) => r.id));
    assert.strictEqual(ids.size, rows.length, `${name}: ids must be unique`);
    for (const r of rows) {
      assert(validateScore(r[scoreKey]), `${name} ${r.id}: ${scoreKey} out of range`);
      assert(['scientific', 'literary', 'vocational'].includes(r.stream), `${name} ${r.id}: bad stream`);
    }
  }
  const schIds = new Set(schData.map((s) => s.id));
  assert.strictEqual(schIds.size, schData.length, 'scholarship ids must be unique');
  for (const s of schData) {
    assert(['open', 'closed', 'upcoming', 'discontinued'].includes(s.status), `${s.id}: bad status`);
    assert(/^https?:\/\//.test(s.application_url), `${s.id}: application_url must be absolute`);
    if (s.deadline && /^\d/.test(s.deadline)) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(s.deadline), `${s.id}: deadline must be YYYY-MM-DD`);
    }
  }
});

// ---------- Normalizer ----------
suite('Normalizer', () => {
  assert.strictEqual(normalizeScoreInput('٨٥.٥'), '85.5', 'Eastern Arabic digits conversion');
  assert.strictEqual(normalizeScoreInput('۸۵.۵'), '85.5', 'Persian/Kurdish digits conversion');
  assert.strictEqual(normalizeScoreInput('٩٢،٧٥'), '92.75', 'Arabic comma to decimal point');
  assert.strictEqual(normalizeScoreInput('  ٧٠% '), '70', 'Strip non-numeric signs like percent and spaces');
  assert.strictEqual(normalizeScoreInput('1.2.3'), '1.23', 'Collapse extra decimal points');
  assert(validateScore(0) && validateScore(100), 'Bounds are inclusive');
  assert(!validateScore(100.01) && !validateScore(-1) && !validateScore(NaN), 'Reject out-of-range');
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
  const krg = filterKRGCutoffs(krgData, { system: 'krg', score: 100, stream: 'scientific' });
  assert(krg.every((r) => r.stream === 'scientific'), 'KRG filter respects stream');
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
    location: 'أربيل', studyType: 'government', channel: 'all'
  };
  assert.deepStrictEqual(parseCheckerState(serializeCheckerState(state)), state, 'Round-trip');
  const junk = parseCheckerState('?sys=evil&stream=nope&sub=bio');
  assert.strictEqual(junk.system, 'federal', 'Unknown system ignored');
  assert.strictEqual(junk.stream, 'scientific', 'Unknown stream ignored');
  assert.strictEqual(parseCheckerState('?stream=literary&sub=bio').subStream, undefined, 'Sub-stream only for scientific');
});

// ---------- Translations ----------
suite('Translations complete in all languages', () => {
  const keys = Object.keys(ar).sort();
  for (const [name, dict] of [['ckb', ckb], ['kmr', kmr]]) {
    assert.deepStrictEqual(Object.keys(dict).sort(), keys, `${name} must have the same keys as ar`);
  }
  for (const [name, dict] of [['ar', ar], ['ckb', ckb], ['kmr', kmr]]) {
    for (const [k, v] of Object.entries(dict)) {
      assert(typeof v === 'string' && v.trim() !== '', `${name}.${k} must be non-empty`);
    }
    for (const k of ['resultsCount', 'scholarshipsFound']) {
      assert(dict[k].includes('{count}'), `${name}.${k} must contain {count}`);
    }
  }
});

console.log(`--- ALL ${suites} TEST SUITES PASSED ---`);
