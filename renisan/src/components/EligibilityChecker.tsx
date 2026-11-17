import { useState, useMemo, useEffect } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import type { AdmissionSystem, FederalCutoff, KRGCutoff, CheckerFilters, DatasetMeta, Gender, ProgramLevel, FederalRules } from '../lib/types';
import { normalizeDigits, validateScore, computeKRGComposite, MAX_SCORE_FEDERAL, MAX_SCORE_KRG } from '../lib/normalizer';
import { fillTemplate } from '../lib/format';
import { filterFederalCutoffs, filterKRGCutoffs, getUniqueGovernorates, getUniqueCities } from '../lib/search';
import { parseCheckerState, serializeCheckerState, type Stream, type SubStream } from '../lib/url-state';
import { localizePlace } from '../lib/places';
import type { TranslationKeys } from '../lib/i18n';
import { SystemSelector } from './SystemSelector';
import { ResultsList } from './ResultsList';
import { OtherRoutes } from './OtherRoutes';
import { loadFederalHistory, loadFederalRules } from '../lib/data-loader';
import { getTrend, type FederalHistory } from '../lib/history';
import { chanceBand, countBands, type ChanceBand } from '../lib/chance';

interface EligibilityCheckerProps {
  federalData: FederalCutoff[];
  krgData: KRGCutoff[];
  meta: DatasetMeta | null;
}

const STUDY_TYPES_FEDERAL = ['morning', 'evening', 'parallel'];
const STUDY_TYPES_KRG = ['government', 'parallel', 'evening'];
const CHANNELS = ['general', 'martyrs', 'distinguished', 'survivors', 'medical_free'];

const STUDY_TYPE_LABELS: Record<string, keyof TranslationKeys> = {
  morning: 'studyTypeMorning',
  evening: 'studyTypeEvening',
  parallel: 'studyTypeParallel',
  government: 'studyTypeGovernment'
};
const CHANNEL_LABELS: Record<string, keyof TranslationKeys> = {
  general: 'channelGeneral',
  martyrs: 'channelMartyrs',
  distinguished: 'channelDistinguished',
  survivors: 'channelSurvivors',
  medical_free: 'channelMedicalFree'
};

const SCORE_PRESETS = [98, 95, 90, 85, 80, 75, 70];

/** Parses user input (any digit script) into a number, or null if not a valid 0–max score. */
function parseScore(raw: string, max: number = MAX_SCORE_FEDERAL): number | null {
  const cleaned = normalizeDigits(raw);
  if (cleaned === '') return null;
  const val = parseFloat(cleaned);
  return validateScore(val, max) ? val : null;
}

export function EligibilityChecker({ federalData, krgData, meta }: EligibilityCheckerProps) {
  const { t, lang } = useI18n();

  // Initial state comes from the URL so shared links reopen with the same inputs
  const initial = useMemo(
    () => parseCheckerState(typeof window !== 'undefined' ? window.location.search : ''),
    []
  );

  const [system, setSystemState] = useState<AdmissionSystem>(initial.system);
  const [rawScore, setRawScore] = useState<string>(initial.score);
  const [stream, setStream] = useState<Stream>(initial.stream);
  const [subStream, setSubStream] = useState<SubStream | undefined>(initial.subStream);
  const [governorate, setGovernorate] = useState<string>(initial.location);
  const [studyType, setStudyType] = useState<string>(initial.studyType);
  const [channel, setChannel] = useState<string>(initial.channel);
  const [gender, setGender] = useState<Gender>(initial.gender);
  const [level, setLevel] = useState<ProgramLevel | 'all'>(initial.level);

  // Score ceiling differs per system: Federal competitive averages can exceed 100
  const maxScore = system === 'federal'
    ? (meta?.federal.max_score ?? MAX_SCORE_FEDERAL)
    : (meta?.krg.max_score ?? MAX_SCORE_KRG);
  const info = meta ? (system === 'federal' ? meta.federal : meta.krg) : null;
  const yearLabel = info ? (lang === 'ar' && info.year_label_ar) || info.year_label : '';

  // New search, sort and reach state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'cutoff_desc' | 'cutoff_asc' | 'closest' | 'alpha'>('cutoff_desc');
  const [showReach, setShowReach] = useState<boolean>(false);
  // Results summary: tap a band (safe / competitive / reach) to show only those
  const [bandFilter, setBandFilter] = useState<ChanceBand | 'all'>('all');
  // Phones: secondary filters fold away so results start higher on the screen
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Prior-year cutoffs and rule-based routes load after the main data so the
  // checker never waits for them; cards fill in trends when they arrive.
  const [history, setHistory] = useState<FederalHistory | null>(null);
  const [rules, setRules] = useState<FederalRules | null>(null);
  useEffect(() => {
    let alive = true;
    loadFederalHistory().then((h) => { if (alive) setHistory(h); }).catch(() => {});
    loadFederalRules().then((r) => { if (alive) setRules(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // KRG Composite Calculator state
  const [showCompositeCalc, setShowCompositeCalc] = useState(false);
  const [g12, setG12] = useState<string>('85');
  const [g11, setG11] = useState<string>('80');
  const [g10, setG10] = useState<string>('75');

  // Location / study-type values differ between systems, so reset them on switch
  const setSystem = (next: AdmissionSystem) => {
    if (next === system) return;
    setSystemState(next);
    setGovernorate('all');
    setStudyType('all');
    setChannel('all');
    setLevel('all');
    setShowCompositeCalc(false);
  };

  const score = useMemo(() => parseScore(rawScore, maxScore), [rawScore, maxScore]);
  const hasScoreInput = normalizeDigits(rawScore) !== '';
  const scoreError = hasScoreInput && score === null;

  // Composite score — uses the same best-of rule as the library (G10/G11 can only help)
  const compositeScore = useMemo(() => {
    const n12 = parseScore(g12);
    if (n12 === null) return null;
    const n11 = parseScore(g11);
    const n10 = parseScore(g10);
    return computeKRGComposite(n12, n11 ?? undefined, n10 ?? undefined);
  }, [g12, g11, g10]);

  // While the calculator is open, it drives the main score field
  useEffect(() => {
    if (system === 'krg' && showCompositeCalc && compositeScore !== null) {
      setRawScore(compositeScore.toFixed(2));
    }
  }, [system, showCompositeCalc, compositeScore]);

  // Keep the URL in sync so the Share button shares these exact inputs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = serializeCheckerState({
      system,
      score: rawScore,
      stream,
      subStream: stream === 'scientific' ? subStream : undefined,
      location: governorate,
      studyType,
      channel,
      gender,
      level
    });
    const next = `${window.location.pathname}${qs}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, '', next);
    }
  }, [system, rawScore, stream, subStream, governorate, studyType, channel, gender, level]);

  // Unique locations
  const federalGovernorates = useMemo(() => getUniqueGovernorates(federalData), [federalData]);
  const krgCities = useMemo(() => getUniqueCities(krgData), [krgData]);

  // Only offer study types / channels that actually exist for this system + stream,
  // so students never pick a filter that can only return "no results".
  const rowsForStream = useMemo<(FederalCutoff | KRGCutoff)[]>(
    () => (system === 'federal' ? federalData : krgData).filter((r) => r.stream === stream),
    [system, federalData, krgData, stream]
  );
  const availableStudyTypes = useMemo(() => {
    const order = system === 'federal' ? STUDY_TYPES_FEDERAL : STUDY_TYPES_KRG;
    const present = new Set(rowsForStream.map((r) => r.study_type as string));
    return order.filter((st) => present.has(st));
  }, [system, rowsForStream]);
  const availableChannels = useMemo(() => {
    if (system !== 'federal') return [];
    const present = new Set((rowsForStream as FederalCutoff[]).map((r) => r.channel as string));
    return CHANNELS.filter((c) => present.has(c));
  }, [system, rowsForStream]);
  // Sub-stream (bio/applied) and institute filters only appear when the dataset uses them
  const hasSubStreams = useMemo(() => rowsForStream.some((r) => !!r.sub_stream), [rowsForStream]);
  const hasInstitutes = useMemo(
    () => system === 'federal' && (rowsForStream as FederalCutoff[]).some((r) => r.level === 'institute'),
    [system, rowsForStream]
  );
  const hasSingleSex = useMemo(() => rowsForStream.some((r) => r.gender !== 'both'), [rowsForStream]);

  // If a selection is no longer available (e.g. after changing stream), fall back to "all"
  useEffect(() => {
    if (studyType !== 'all' && !availableStudyTypes.includes(studyType)) setStudyType('all');
  }, [availableStudyTypes, studyType]);
  // Channels are mutually exclusive for a student (a distinguished-school graduate
  // competes on that list), so an unavailable or "all" choice falls back to general.
  useEffect(() => {
    if (availableChannels.length > 0 && !availableChannels.includes(channel)) setChannel('general');
  }, [availableChannels, channel]);
  useEffect(() => {
    const locs: string[] = system === 'federal' ? federalGovernorates : krgCities;
    if (governorate !== 'all' && locs.length > 0 && !locs.includes(governorate)) setGovernorate('all');
  }, [system, federalGovernorates, krgCities, governorate]);

  const filters = useMemo<CheckerFilters | null>(() => {
    if (score === null) return null;
    return {
      system,
      score,
      stream,
      sub_stream: stream === 'scientific' ? subStream : undefined,
      governorate: governorate === 'all' ? undefined : governorate,
      study_type: studyType === 'all' ? undefined : studyType,
      channel: system === 'federal' && channel !== 'all' ? channel : undefined,
      gender: gender === 'both' ? undefined : gender,
      level: level === 'all' ? undefined : level,
      search: searchQuery.trim() !== '' ? searchQuery : undefined,
      show_reach: showReach,
      sort_by: sortBy
    };
  }, [system, score, stream, subStream, governorate, studyType, channel, gender, level, searchQuery, showReach, sortBy]);

  const federalResults = useMemo(
    () => (filters && system === 'federal' ? filterFederalCutoffs(federalData, filters) : []),
    [federalData, filters, system]
  );

  const krgResults = useMemo(
    () => (filters && system === 'krg' ? filterKRGCutoffs(krgData, filters) : []),
    [krgData, filters, system]
  );

  // Chance bands over the full result set, then the optional band filter on top
  const cutoffOf = (r: FederalCutoff | KRGCutoff) => ('min_average' in r ? r.min_average : r.min_composite_score);
  const bandCounts = useMemo(() => {
    if (score === null) return null;
    const rows: (FederalCutoff | KRGCutoff)[] = system === 'federal' ? federalResults : krgResults;
    return countBands(rows.map((r) => score - cutoffOf(r)));
  }, [system, federalResults, krgResults, score]);
  const inBand = (r: FederalCutoff | KRGCutoff) => score !== null && chanceBand(score - cutoffOf(r)) === bandFilter;
  const shownFederal = useMemo(
    () => (bandFilter === 'all' ? federalResults : federalResults.filter(inBand)),
    [federalResults, bandFilter, score]
  );
  const shownKrg = useMemo(
    () => (bandFilter === 'all' ? krgResults : krgResults.filter(inBand)),
    [krgResults, bandFilter, score]
  );
  // A band that no longer has results (e.g. reach turned off) falls back to all
  useEffect(() => {
    if (bandFilter !== 'all' && bandCounts && bandCounts[bandFilter] === 0) setBandFilter('all');
  }, [bandCounts, bandFilter]);

  const resultCount = system === 'federal' ? federalResults.length : krgResults.length;

  // For the "no results" screen: the lowest cutoff above the student's score
  // among programs that match every other filter.
  const nearestCutoff = useMemo(() => {
    if (!filters || resultCount > 0) return null;
    const relaxed = { ...filters, score: maxScore, show_reach: false };
    const cutoffs = system === 'federal'
      ? filterFederalCutoffs(federalData, relaxed).map((r) => r.min_average)
      : filterKRGCutoffs(krgData, relaxed).map((r) => r.min_composite_score);
    const above = cutoffs.filter((c) => c > filters.score);
    return above.length ? Math.min(...above) : null;
  }, [filters, resultCount, system, federalData, krgData, maxScore]);

  const hasNarrowingFilters = governorate !== 'all' || studyType !== 'all' || channel !== 'all' || subStream !== undefined || gender !== 'both' || level !== 'all';
  // Count of folded-away filters that are not at their default (shown on the phone toggle)
  const advancedActive = [governorate !== 'all', studyType !== 'all', channel !== 'all' && channel !== 'general', gender !== 'both', level !== 'all'].filter(Boolean).length;
  const clearNarrowingFilters = () => {
    setGovernorate('all');
    setStudyType('all');
    setChannel('all');
    setSubStream(undefined);
    setGender('both');
    setLevel('all');
  };
  const scrollToResults = () => {
    document.getElementById('results-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Weighted sum before the best-of rule, so the breakdown always adds up
  const g12n = parseScore(g12);
  const weightedSum =
    g12n !== null ? g12n * 0.8 + (parseScore(g11) ?? g12n) * 0.1 + (parseScore(g10) ?? g12n) * 0.1 : null;
  const bestOfApplied = compositeScore !== null && weightedSum !== null && compositeScore > weightedSum + 1e-9;

  const selectStream = (next: Stream) => {
    setStream(next);
    if (next !== 'scientific') setSubStream(undefined);
  };

  const adjustScore = (delta: number) => {
    const current = score ?? 80;
    const next = Math.max(0, Math.min(maxScore, Number((current + delta).toFixed(2))));
    setRawScore(String(next));
  };

  const pill = (active: boolean) => `pill-btn ${active ? 'pill-btn--active' : ''}`;

  return (
    <div class="checker-container">
      <SystemSelector selected={system} onSelect={setSystem} />

      {info && (
        <p class={`data-note ${system === 'krg' ? 'data-note--warning' : ''}`} role="note">
          <span aria-hidden="true">{system === 'federal' ? '📄' : '⚠️'}</span>
          <span>
            {fillTemplate(t(system === 'federal' ? 'federalDataNote' : 'krgDataNote'), { year: yearLabel })}
            {' '}
            <a href={info.source_url} target="_blank" rel="noopener noreferrer">{t('officialSourceLink')}</a>
          </span>
        </p>
      )}

      <form class={`checker-form ${filtersOpen ? 'checker-form--filters-open' : ''}`} onSubmit={(e) => e.preventDefault()}>
        <div class="form-grid">
          {/* Score input with quick clear and +/- step controls */}
          <div class="form-group score-form-group">
            <div class="score-label-row">
              <label class="form-label" for="score-input">
                {t('scoreLabel')}
              </label>
              {rawScore && (
                <button
                  type="button"
                  class="score-clear-text-btn"
                  onClick={() => setRawScore('')}
                  aria-label={t('clearScore')}
                >
                  {t('clearScore')}
                </button>
              )}
            </div>

            <div class="score-input-wrapper">
              <input
                id="score-input"
                class="form-input score-main-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={rawScore}
                onInput={(e) => setRawScore((e.target as HTMLInputElement).value)}
                placeholder={t('scorePlaceholder')}
                readOnly={system === 'krg' && showCompositeCalc}
                aria-invalid={scoreError}
                aria-describedby={scoreError ? 'score-error' : undefined}
              />
              <div class="score-stepper-buttons">
                <button
                  type="button"
                  class="stepper-btn"
                  dir="ltr"
                  onClick={() => adjustScore(-0.5)}
                  title="-0.5"
                  aria-label="-0.5"
                >
                  −0.5
                </button>
                <button
                  type="button"
                  class="stepper-btn"
                  dir="ltr"
                  onClick={() => adjustScore(0.5)}
                  title="+0.5"
                  aria-label="+0.5"
                >
                  +0.5
                </button>
              </div>
            </div>

            {scoreError && (
              <span id="score-error" class="form-error" role="status">
                {fillTemplate(t('scoreOutOfRange'), { max: maxScore })}
              </span>
            )}
            {system === 'federal' && score !== null && score > 100 && (
              <span class="form-hint" role="status">{t('scoreAbove100Hint')}</span>
            )}

            {/* Instant feedback: on phones the results are far below the form */}
            {score !== null && resultCount > 0 && (
              <button type="button" class="jump-to-results" onClick={scrollToResults} aria-live="polite">
                <span>{t('resultsCount').replace('{count}', String(resultCount))}</span>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}

            {/* Quick Score Preset Chips — starter suggestions only, hidden once a real score is typed */}
            {!hasScoreInput && (
            <div class="quick-presets-row">
              <span class="quick-presets-label">{t('quickPresets')}</span>
              <div class="quick-presets-chips">
                {SCORE_PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    class={`quick-preset-chip ${rawScore === String(val) ? 'quick-preset-chip--active' : ''}`}
                    onClick={() => setRawScore(String(val))}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>

          {/* Stream */}
          <div class="form-group">
            <span class="form-label" id="stream-label">{t('streamLabel')}</span>
            <div class="pill-group" role="radiogroup" aria-labelledby="stream-label">
              {(['scientific', 'literary', 'vocational'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={stream === s}
                  class={pill(stream === s)}
                  onClick={() => selectStream(s)}
                >
                  {s === 'scientific' ? t('streamScientific') : s === 'literary' ? t('streamLiterary') : t('streamVocational')}
                </button>
              ))}
            </div>
          </div>

          {/* Sub stream (Bio / Applied) — only when the dataset distinguishes them */}
          {stream === 'scientific' && hasSubStreams && (
            <div class="form-group">
              <span class="form-label" id="substream-label">{t('subStreamLabel')}</span>
              <div class="pill-group" role="radiogroup" aria-labelledby="substream-label">
                <button type="button" role="radio" aria-checked={subStream === undefined} class={pill(subStream === undefined)} onClick={() => setSubStream(undefined)}>
                  {t('scholarshipFilterAll')}
                </button>
                <button type="button" role="radio" aria-checked={subStream === 'bio'} class={pill(subStream === 'bio')} onClick={() => setSubStream('bio')}>
                  {t('subStreamBio')}
                </button>
                <button type="button" role="radio" aria-checked={subStream === 'applied'} class={pill(subStream === 'applied')} onClick={() => setSubStream('applied')}>
                  {t('subStreamApplied')}
                </button>
              </div>
            </div>
          )}

          {/* Phones only: reveal the secondary filters */}
          <button
            type="button"
            class="filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="advanced-filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M7 12h10M10 18h4" />
            </svg>
            <span>{filtersOpen ? t('filtersHide') : t('filtersMore')}</span>
            {advancedActive > 0 && <span class="filters-toggle__count">{advancedActive}</span>}
          </button>

          {/* Gender — single-sex programmes (nursing, women's colleges) */}
          {hasSingleSex && (
            <div class="form-group form-group--advanced">
              <span class="form-label" id="gender-label">{t('genderLabel')}</span>
              <div class="pill-group pill-group--compact" role="radiogroup" aria-labelledby="gender-label">
                {(['both', 'male', 'female'] as const).map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={gender === g} class={pill(gender === g)} onClick={() => setGender(g)}>
                    {g === 'both' ? t('genderAny') : g === 'male' ? t('genderMale') : t('genderFemale')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Programme level — bachelor colleges vs. technical institutes */}
          {hasInstitutes && (
            <div class="form-group form-group--advanced">
              <span class="form-label" id="level-label">{t('levelLabel')}</span>
              <div class="pill-group pill-group--compact" role="radiogroup" aria-labelledby="level-label">
                {(['all', 'college', 'institute'] as const).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={level === l} class={pill(level === l)} onClick={() => setLevel(l)}>
                    {l === 'all' ? t('levelAll') : l === 'college' ? t('levelCollege') : t('levelInstitute')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Location */}
          <div class="form-group form-group--advanced" id="advanced-filters">
            <label class="form-label" for="location-select">
              {t('governorateLabel')}
            </label>
            <select
              id="location-select"
              class="form-select"
              value={governorate}
              onChange={(e) => setGovernorate((e.target as HTMLSelectElement).value)}
            >
              <option value="all">{t('governorateAll')}</option>
              {(system === 'federal' ? federalGovernorates : krgCities).map((loc) => (
                <option key={loc} value={loc}>
                  {localizePlace(loc, lang)}
                </option>
              ))}
            </select>
          </div>

          {/* Study Type */}
          <div class="form-group form-group--advanced">
            <label class="form-label" for="study-type-select">
              {t('studyTypeLabel')}
            </label>
            <select
              id="study-type-select"
              class="form-select"
              value={studyType}
              onChange={(e) => setStudyType((e.target as HTMLSelectElement).value)}
            >
              <option value="all">{t('scholarshipFilterAll')}</option>
              {availableStudyTypes.map((st) => (
                <option key={st} value={st}>{t(STUDY_TYPE_LABELS[st])}</option>
              ))}
            </select>
          </div>

          {/* Federal Channel — only shown when the data has more than one channel */}
          {system === 'federal' && availableChannels.length > 1 && (
            <div class="form-group form-group--advanced">
              <label class="form-label" for="channel-select">
                {t('channelLabel')}
              </label>
              <select
                id="channel-select"
                class="form-select"
                value={channel}
                onChange={(e) => setChannel((e.target as HTMLSelectElement).value)}
              >
                {availableChannels.map((c) => (
                  <option key={c} value={c}>{t(CHANNEL_LABELS[c])}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* KRG Composite Calculator Toggle */}
        {system === 'krg' && (
          <div class="composite-box">
            <button
              type="button"
              class="composite-box__header"
              aria-expanded={showCompositeCalc}
              aria-controls="composite-panel"
              onClick={() => setShowCompositeCalc(!showCompositeCalc)}
            >
              <span class="composite-box__title">
                <span aria-hidden="true">{showCompositeCalc ? '▼' : '▶'}</span> {t('krgCompositeTitle')}
              </span>
              <span class="composite-box__toggle-text">
                {showCompositeCalc ? t('compositeHide') : t('compositeShow')}
              </span>
            </button>

            {showCompositeCalc && (
              <div id="composite-panel" class="fade-in composite-box__panel">
                <div class="composite-box__grid">
                  {([
                    ['g12-input', 'krgGrade12', g12, setG12],
                    ['g11-input', 'krgGrade11', g11, setG11],
                    ['g10-input', 'krgGrade10', g10, setG10]
                  ] as const).map(([id, labelKey, value, setter]) => (
                    <div class="form-group" key={id}>
                      <label class="form-label" for={id}>{t(labelKey)}</label>
                      <input
                        id={id}
                        class="form-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={value}
                        aria-invalid={normalizeDigits(value) !== '' && parseScore(value) === null}
                        onInput={(e) => setter((e.target as HTMLInputElement).value)}
                      />
                    </div>
                  ))}
                </div>

                <div class="composite-result-badge" aria-live="polite">
                  <span>{t('krgCompositeResult')}</span>
                  <strong>{compositeScore !== null ? `${compositeScore.toFixed(2)}%` : '—'}</strong>
                </div>

                {/* Calculation breakdown */}
                {compositeScore !== null && parseScore(g12) !== null && (
                  <div class="composite-breakdown-card">
                    <span class="composite-breakdown-card__title">{t('krgFormulaBreakdown')}</span>
                    <div class="composite-breakdown-card__steps">
                      <span>G12 (80%): {(parseScore(g12)! * 0.8).toFixed(1)}</span>
                      <span>+ G11 (10%): {((parseScore(g11) ?? g12n!) * 0.1).toFixed(1)}</span>
                      <span>+ G10 (10%): {((parseScore(g10) ?? g12n!) * 0.1).toFixed(1)}</span>
                      <strong>= {weightedSum!.toFixed(2)}%</strong>
                    </div>
                    {bestOfApplied && (
                      <p class="composite-breakdown-card__bestof">
                        {t('compositeBestOfApplied').replace('{score}', compositeScore.toFixed(2))}
                      </p>
                    )}
                  </div>
                )}

                <p class="composite-note-banner">
                  ℹ️ {t('compositeEstimateNote')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Second Row: Instant Search & Sort Controls & Reach Checkbox */}
        <div class="checker-secondary-controls">
          <div class="search-input-wrapper">
            <svg aria-hidden="true" class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              class="search-input"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              aria-label={t('searchPlaceholder')}
            />
            {searchQuery && (
              <button
                type="button"
                class="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label={t('clearScore')}
              >
                ✕
              </button>
            )}
          </div>

          <div class="sort-and-reach-group">
            <div class="sort-wrapper">
              <label class="sort-label" for="sort-select">{t('sortByLabel')}:</label>
              <select
                id="sort-select"
                class="form-select sort-select"
                value={sortBy}
                onChange={(e) => setSortBy((e.target as HTMLSelectElement).value as any)}
              >
                <option value="cutoff_desc">{t('sortCutoffDesc')}</option>
                <option value="cutoff_asc">{t('sortCutoffAsc')}</option>
                <option value="closest">{t('sortClosest')}</option>
                <option value="alpha">{t('sortAlpha')}</option>
              </select>
            </div>

            <label class="reach-toggle-label">
              <input
                type="checkbox"
                class="reach-checkbox"
                checked={showReach}
                onChange={(e) => setShowReach((e.target as HTMLInputElement).checked)}
              />
              <span>{t('showReachLabel')}</span>
            </label>
          </div>
        </div>
      </form>

      {/* Rule-based routes (evening / private) the cutoff list does not cover */}
      {system === 'federal' && rules && score !== null && (
        <OtherRoutes rules={rules} score={score} stream={stream} yearLabel={yearLabel} />
      )}

      {/* Results List */}
      <div id="results-anchor" class="results-anchor" />
      {score !== null && bandCounts && resultCount > 0 && (
        <div class="chance-summary" role="group" aria-label={t('chanceSummaryLabel')}>
          <div class="chance-summary__bar" aria-hidden="true">
            {(['safe', 'target', 'reach'] as const).map((b) => bandCounts[b] > 0 && (
              <span key={b} class={`chance-summary__seg chance-summary__seg--${b}`} style={{ flexGrow: bandCounts[b] }} />
            ))}
          </div>
          <div class="chance-summary__chips">
            <button
              type="button"
              class={`chance-chip ${bandFilter === 'all' ? 'chance-chip--active' : ''}`}
              aria-pressed={bandFilter === 'all'}
              onClick={() => setBandFilter('all')}
            >
              {t('scholarshipFilterAll')} <strong>{resultCount}</strong>
            </button>
            {(['safe', 'target', 'reach'] as const).map((b) => bandCounts[b] > 0 && (
              <button
                key={b}
                type="button"
                class={`chance-chip chance-chip--${b} ${bandFilter === b ? 'chance-chip--active' : ''}`}
                aria-pressed={bandFilter === b}
                onClick={() => setBandFilter(bandFilter === b ? 'all' : b)}
              >
                <span class="chance-chip__dot" aria-hidden="true" />
                {t(b === 'safe' ? 'scoreDeltaSafe' : b === 'target' ? 'scoreDeltaTarget' : 'scoreDeltaReach')}
                <strong>{bandCounts[b]}</strong>
              </button>
            ))}
          </div>
          <p class="chance-summary__hint">{t('chanceSummaryHint')}</p>
        </div>
      )}
      {score === null ? (
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">✍️</span>
          <h3 class="empty-state__title">{t('enterScorePrompt')}</h3>
          <p class="empty-state__hint">{fillTemplate(t('enterScoreHint'), { max: maxScore })}</p>
        </div>
      ) : (
        <ResultsList
          federalResults={shownFederal}
          krgResults={shownKrg}
          system={system}
          studentScore={score}
          yearLabel={yearLabel}
          trendFor={(item) => getTrend(item, history)}
          emptyHelp={{
            nearestCutoff,
            onClearSearch: searchQuery.trim() ? () => setSearchQuery('') : undefined,
            onShowReach: !showReach ? () => setShowReach(true) : undefined,
            onClearFilters: hasNarrowingFilters ? clearNarrowingFilters : undefined
          }}
        />
      )}
    </div>
  );
}
