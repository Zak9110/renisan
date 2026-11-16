import { useState, useMemo, useEffect } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import type { AdmissionSystem, FederalCutoff, KRGCutoff, CheckerFilters } from '../lib/types';
import { normalizeDigits, validateScore, computeKRGComposite } from '../lib/normalizer';
import { filterFederalCutoffs, filterKRGCutoffs, getUniqueGovernorates, getUniqueCities } from '../lib/search';
import { parseCheckerState, serializeCheckerState, type Stream, type SubStream } from '../lib/url-state';
import { localizePlace } from '../lib/places';
import type { TranslationKeys } from '../lib/i18n';
import { SystemSelector } from './SystemSelector';
import { ResultsList } from './ResultsList';

interface EligibilityCheckerProps {
  federalData: FederalCutoff[];
  krgData: KRGCutoff[];
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

/** Parses user input (any digit script) into a number, or null if not a valid 0–100 score. */
function parseScore(raw: string): number | null {
  const cleaned = normalizeDigits(raw);
  if (cleaned === '') return null;
  const val = parseFloat(cleaned);
  return validateScore(val) ? val : null;
}

export function EligibilityChecker({ federalData, krgData }: EligibilityCheckerProps) {
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
    setShowCompositeCalc(false);
  };

  const score = useMemo(() => parseScore(rawScore), [rawScore]);
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
      channel
    });
    const next = `${window.location.pathname}${qs}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, '', next);
    }
  }, [system, rawScore, stream, subStream, governorate, studyType, channel]);

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

  // If a selection is no longer available (e.g. after changing stream), fall back to "all"
  useEffect(() => {
    if (studyType !== 'all' && !availableStudyTypes.includes(studyType)) setStudyType('all');
  }, [availableStudyTypes, studyType]);
  useEffect(() => {
    if (channel !== 'all' && !availableChannels.includes(channel)) setChannel('all');
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
      channel: system === 'federal' && channel !== 'all' ? channel : undefined
    };
  }, [system, score, stream, subStream, governorate, studyType, channel]);

  const federalResults = useMemo(
    () => (filters && system === 'federal' ? filterFederalCutoffs(federalData, filters) : []),
    [federalData, filters, system]
  );

  const krgResults = useMemo(
    () => (filters && system === 'krg' ? filterKRGCutoffs(krgData, filters) : []),
    [krgData, filters, system]
  );

  const selectStream = (next: Stream) => {
    setStream(next);
    if (next !== 'scientific') setSubStream(undefined);
  };

  const pill = (active: boolean) => `pill-btn ${active ? 'pill-btn--active' : ''}`;

  return (
    <div class="checker-container">
      <SystemSelector selected={system} onSelect={setSystem} />

      <form class="checker-form" onSubmit={(e) => e.preventDefault()}>
        <div class="form-grid">
          {/* Score input */}
          <div class="form-group">
            <label class="form-label" for="score-input">
              {t('scoreLabel')}
            </label>
            <input
              id="score-input"
              class="form-input"
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
            {scoreError && (
              <span id="score-error" class="form-error" role="status">
                {t('scoreOutOfRange')}
              </span>
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

          {/* Sub stream (Bio / Applied) if scientific */}
          {stream === 'scientific' && (
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

          {/* Location */}
          <div class="form-group">
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
          <div class="form-group">
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
            <div class="form-group">
              <label class="form-label" for="channel-select">
                {t('channelLabel')}
              </label>
              <select
                id="channel-select"
                class="form-select"
                value={channel}
                onChange={(e) => setChannel((e.target as HTMLSelectElement).value)}
              >
                <option value="all">{t('scholarshipFilterAll')}</option>
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
              </div>
            )}
          </div>
        )}
      </form>

      {/* Results List */}
      {score === null ? (
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">✍️</span>
          <h3 class="empty-state__title">{t('enterScorePrompt')}</h3>
          <p class="empty-state__hint">{t('enterScoreHint')}</p>
        </div>
      ) : (
      <ResultsList
        federalResults={federalResults}
        krgResults={krgResults}
        system={system}
      />
      )}
    </div>
  );
}
