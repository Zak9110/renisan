import { useState, useMemo, useEffect } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import type { Scholarship, ScholarshipFilters } from '../lib/types';
import { filterScholarships, getUniqueCountries } from '../lib/search';
import { normalizeDigits } from '../lib/normalizer';
import { ScholarshipCard } from './ScholarshipCard';
import { localizePlace } from '../lib/places';
import { getProfile, updateProfile, ageFromBirthYear, birthYearFromAge } from '../lib/profile';
import {
  matchScholarship,
  hasEligibilityProfile,
  getDeadlineBucket,
  getDaysUntilDeadline,
  type EducationLevel,
  type EnglishLevel,
  type EligibilityProfile,
  type MatchResult,
  type DeadlineBucket
} from '../lib/matcher';
import { pickLocalized, type TranslationKeys } from '../lib/i18n';
import { formatDate } from '../lib/format';
import { downloadAllScholarshipsIcs, downloadScholarshipIcs } from '../lib/calendar';
import { isWishlisted, toggleWishlist, onWishlistChange } from '../lib/wishlist';

interface ScholarshipDirectoryProps {
  scholarships: Scholarship[];
  initialStudentScore?: number | null;
}

type EligibleMode = 'all' | 'go' | 'go_maybe';
type ViewMode = 'cards' | 'deadlines';

const BUCKET_ORDER: DeadlineBucket[] = ['urgent', 'soon', 'upcoming', 'estimated', 'tba', 'closed'];
const BUCKET_TITLE_KEY: Record<DeadlineBucket, keyof TranslationKeys> = {
  urgent: 'deadlinesUrgentTitle',
  soon: 'deadlinesSoonTitle',
  upcoming: 'deadlinesUpcomingTitle',
  estimated: 'deadlinesEstimatedTitle',
  tba: 'deadlinesTbaTitle',
  closed: 'deadlinesClosedTitle'
};

export function ScholarshipDirectory({ scholarships, initialStudentScore }: ScholarshipDirectoryProps) {
  const { t, tf, lang } = useI18n();
  const savedProfile = useMemo(() => getProfile(), []);

  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [status, setStatus] = useState<string>('all');
  const [degreeLevel, setDegreeLevel] = useState<string>('all');
  const [country, setCountry] = useState<string>('all');
  const [refugeeOnly, setRefugeeOnly] = useState<boolean>(false);

  // Personal eligibility profile inputs (persisted to device profile)
  const [eduLevel, setEduLevel] = useState<EducationLevel | ''>(savedProfile.educationLevel ?? '');
  const [gpaInput, setGpaInput] = useState<string>(() =>
    initialStudentScore != null ? String(Math.min(100, Number(initialStudentScore.toFixed(1)))) : ''
  );
  const [ageInput, setAgeInput] = useState<string>(() => {
    const age = ageFromBirthYear(savedProfile.birthYear);
    return age != null ? String(age) : '';
  });
  const [workExp, setWorkExp] = useState<string>(
    savedProfile.workExperienceYears != null ? String(savedProfile.workExperienceYears) : ''
  );
  const [englishLevel, setEnglishLevel] = useState<EnglishLevel | ''>(savedProfile.englishLevel ?? '');
  const [eligibleMode, setEligibleMode] = useState<EligibleMode>('all');
  const [wishlistTick, setWishlistTick] = useState(0);

  useEffect(() => onWishlistChange(() => setWishlistTick((n) => n + 1)), []);

  useEffect(() => {
    if (initialStudentScore != null && gpaInput === '') {
      setGpaInput(String(Math.min(100, Number(initialStudentScore.toFixed(1)))));
    }
  }, [initialStudentScore]);

  const parsedGpa = useMemo(() => {
    const clean = normalizeDigits(gpaInput);
    if (!clean) return undefined;
    const n = parseFloat(clean);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
  }, [gpaInput]);

  const parsedAge = useMemo(() => {
    const clean = normalizeDigits(ageInput);
    if (!clean) return undefined;
    const n = parseInt(clean, 10);
    return Number.isFinite(n) && n >= 14 && n <= 60 ? n : undefined;
  }, [ageInput]);

  const parsedBirthYear = useMemo(
    () => (parsedAge != null ? birthYearFromAge(parsedAge) : undefined),
    [parsedAge]
  );

  const parsedWorkExp = useMemo(() => {
    if (workExp === '') return undefined;
    const n = parseInt(workExp, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }, [workExp]);

  // Keep local device profile in sync
  useEffect(() => {
    updateProfile({
      birthYear: parsedBirthYear,
      educationLevel: eduLevel || undefined,
      workExperienceYears: parsedWorkExp,
      englishLevel: englishLevel || undefined,
      isRefugeeOrIdp: refugeeOnly ? true : undefined
    });
  }, [parsedBirthYear, eduLevel, parsedWorkExp, englishLevel, refugeeOnly]);

  const eligibilityProfile = useMemo<EligibilityProfile>(
    () => ({
      educationLevel: eduLevel || undefined,
      gpa: parsedGpa,
      birthYear: parsedBirthYear,
      workExperienceYears: parsedWorkExp,
      englishLevel: englishLevel || undefined,
      isRefugeeOrIdp: refugeeOnly || undefined,
      gender: savedProfile.gender
    }),
    [eduLevel, parsedGpa, parsedBirthYear, parsedWorkExp, englishLevel, refugeeOnly, savedProfile.gender]
  );

  const profileActive = useMemo(() => hasEligibilityProfile(eligibilityProfile), [eligibilityProfile]);
  const countries = useMemo(() => getUniqueCountries(scholarships), [scholarships]);

  // Base non-personal filters (status, degree, country, refugee, keyword search)
  const baseFiltered = useMemo(() => {
    const filters: ScholarshipFilters = {
      status: status === 'all' ? undefined : status,
      degree_level: degreeLevel === 'all' ? undefined : degreeLevel,
      country: country === 'all' ? undefined : country,
      refugee_eligible: refugeeOnly ? true : undefined,
      search: searchQuery.trim() !== '' ? searchQuery : undefined
    };
    return filterScholarships(scholarships, filters);
  }, [scholarships, status, degreeLevel, country, refugeeOnly, searchQuery]);

  // Evaluate explainable verdict for each item
  const matchedEntries = useMemo(() => {
    const verdictWeight = { GO: 0, MAYBE: 1, NO_GO: 2 };
    return baseFiltered
      .map((scholarship) => ({
        scholarship,
        match: profileActive ? matchScholarship(scholarship, eligibilityProfile) : null
      }))
      .sort((a, b) => {
        if (a.match && b.match) {
          const vw = verdictWeight[a.match.verdict] - verdictWeight[b.match.verdict];
          if (vw !== 0) return vw;
          if (b.match.rankScore !== a.match.rankScore) return b.match.rankScore - a.match.rankScore;
        }
        return 0;
      });
  }, [baseFiltered, profileActive, eligibilityProfile]);

  const verdictCounts = useMemo(() => {
    const c = { GO: 0, MAYBE: 0, NO_GO: 0 };
    for (const e of matchedEntries) {
      if (e.match) c[e.match.verdict]++;
    }
    return c;
  }, [matchedEntries]);

  // Apply "Eligible for me only" mode on top of explainable verdicts
  const visibleEntries = useMemo(() => {
    if (!profileActive || eligibleMode === 'all') return matchedEntries;
    if (eligibleMode === 'go') return matchedEntries.filter((e) => e.match?.verdict === 'GO');
    return matchedEntries.filter((e) => e.match?.verdict === 'GO' || e.match?.verdict === 'MAYBE');
  }, [matchedEntries, profileActive, eligibleMode]);

  // Group visible items by deadline urgency bucket for Deadlines Timeline view
  const deadlineGroups = useMemo(() => {
    const groups = new Map<DeadlineBucket, { scholarship: Scholarship; match: MatchResult | null; days: number | null }[]>();
    for (const b of BUCKET_ORDER) groups.set(b, []);
    for (const entry of visibleEntries) {
      const bucket = getDeadlineBucket(entry.scholarship);
      groups.get(bucket)!.push({
        ...entry,
        days: getDaysUntilDeadline(entry.scholarship)
      });
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.scholarship.deadline ?? '9999-12-31').localeCompare(b.scholarship.deadline ?? '9999-12-31'));
    }
    return BUCKET_ORDER.map((bucket) => ({ bucket, items: groups.get(bucket)! })).filter((g) => g.items.length > 0);
  }, [visibleEntries]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    status !== 'all' ||
    degreeLevel !== 'all' ||
    country !== 'all' ||
    refugeeOnly ||
    eligibleMode !== 'all' ||
    profileActive;

  const resetFilters = () => {
    setSearchQuery('');
    setStatus('all');
    setDegreeLevel('all');
    setCountry('all');
    setRefugeeOnly(false);
    setEduLevel('');
    setGpaInput('');
    setAgeInput('');
    setWorkExp('');
    setEnglishLevel('');
    setEligibleMode('all');
  };

  const localizedTitle = (s: Scholarship) =>
    pickLocalized(lang, { ar: s.name_ar, ckb: s.name_ckb, kmr: s.name_kmr, en: s.name }) ?? s.name;
  const localizedNotes = (s: Scholarship) =>
    pickLocalized(lang, { ar: s.notes_ar, ckb: s.notes_ckb, kmr: s.notes_kmr, en: s.notes_en });

  const handleExportAllDeadlines = () => {
    const dated = visibleEntries
      .map((e) => e.scholarship)
      .filter((s) => s.deadline && /^\d{4}-\d{2}-\d{2}$/.test(s.deadline) && getDeadlineBucket(s) !== 'closed')
      .map((s) => ({ scholarship: s, localizedTitle: localizedTitle(s), localizedNotes: localizedNotes(s) }));
    downloadAllScholarshipsIcs(dated, t('deadlineExpected'));
  };

  const exportableCount = useMemo(
    () =>
      visibleEntries.filter(
        (e) => e.scholarship.deadline && /^\d{4}-\d{2}-\d{2}$/.test(e.scholarship.deadline) && getDeadlineBucket(e.scholarship) !== 'closed'
      ).length,
    [visibleEntries]
  );

  // Silence lint on wishlistTick used to re-render star states inside Deadlines view
  void wishlistTick;

  return (
    <div class="scholarships-container">
      <div class="scholarships-hero">
        <h2 class="scholarships-hero__title">{t('scholarshipsTitle')}</h2>
        <p class="scholarships-hero__subtitle">{t('scholarshipsSubtitle')}</p>
      </div>

      {/* My Eligibility Profile Card */}
      <section class="eligibility-profile-card" aria-label={t('eligibilityProfileTitle')}>
        <div class="eligibility-profile-card__head">
          <div>
            <h3 class="eligibility-profile-card__title">🎯 {t('eligibilityProfileTitle')}</h3>
            <p class="eligibility-profile-card__hint">{t('eligibilityProfileHint')}</p>
          </div>

          <div class="view-switcher" role="group" aria-label={t('viewDeadlines')}>
            <button
              type="button"
              class={`pill-btn ${viewMode === 'cards' ? 'pill-btn--active' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              {t('viewCards')}
            </button>
            <button
              type="button"
              class={`pill-btn ${viewMode === 'deadlines' ? 'pill-btn--active' : ''}`}
              onClick={() => setViewMode('deadlines')}
            >
              📅 {t('viewDeadlines')}
            </button>
          </div>
        </div>

        <div class="eligibility-profile-grid">
          <select
            class="filter-select"
            value={eduLevel}
            onChange={(e) => setEduLevel((e.target as HTMLSelectElement).value as EducationLevel | '')}
            aria-label={t('eduLevelLabel')}
          >
            <option value="">{t('eduLevelLabel')}: {t('eduLevelAny')}</option>
            <option value="grade12">{t('eduLevelGrade12')}</option>
            <option value="undergrad">{t('eduLevelUndergrad')}</option>
            <option value="graduate">{t('eduLevelGraduate')}</option>
          </select>

          <input
            type="text"
            inputMode="decimal"
            class="filter-select"
            placeholder={t('scholarshipMyGPA')}
            aria-label={t('scholarshipMyGPA')}
            value={gpaInput}
            onInput={(e) => setGpaInput((e.target as HTMLInputElement).value)}
          />

          <input
            type="text"
            inputMode="numeric"
            class="filter-select"
            placeholder={t('scholarshipMyAge')}
            aria-label={t('scholarshipMyAge')}
            value={ageInput}
            onInput={(e) => setAgeInput((e.target as HTMLInputElement).value)}
          />

          <select
            class="filter-select"
            value={workExp}
            onChange={(e) => setWorkExp((e.target as HTMLSelectElement).value)}
            aria-label={t('workExpLabel')}
          >
            <option value="">{t('workExpLabel')}: {t('eduLevelAny')}</option>
            <option value="0">{t('workExpNone')}</option>
            <option value="1">{t('workExpOne')}</option>
            <option value="2">{t('workExpTwoPlus')}</option>
          </select>

          <select
            class="filter-select"
            value={englishLevel}
            onChange={(e) => setEnglishLevel((e.target as HTMLSelectElement).value as EnglishLevel | '')}
            aria-label={t('englishLevelLabel')}
          >
            <option value="">{t('englishLevelLabel')}: {t('englishLevelAny')}</option>
            <option value="none">{t('englishLevelNone')}</option>
            <option value="basic">{t('englishLevelBasic')}</option>
            <option value="ielts_toefl">{t('englishLevelCert')}</option>
          </select>

          <label class="filter-checkbox">
            <input
              type="checkbox"
              checked={refugeeOnly}
              onChange={(e) => setRefugeeOnly((e.target as HTMLInputElement).checked)}
            />
            <span>{t('scholarshipRefugeeEligible')}</span>
          </label>
        </div>

        {/* Eligible-for-me-only segmented control + live verdict counts */}
        {profileActive && (
          <div class="eligible-only-bar">
            <div class="eligible-mode-pills" role="radiogroup" aria-label={t('eligibleOnlyToggle')}>
              <button
                type="button"
                role="radio"
                aria-checked={eligibleMode === 'go'}
                class={`chance-chip chance-chip--safe ${eligibleMode === 'go' ? 'chance-chip--active' : ''}`}
                onClick={() => setEligibleMode(eligibleMode === 'go' ? 'all' : 'go')}
              >
                <span class="chance-chip__dot" aria-hidden="true" />
                <span>{t('eligibleModeGo')}</span>
                <strong>{verdictCounts.GO}</strong>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={eligibleMode === 'go_maybe'}
                class={`chance-chip chance-chip--target ${eligibleMode === 'go_maybe' ? 'chance-chip--active' : ''}`}
                onClick={() => setEligibleMode(eligibleMode === 'go_maybe' ? 'all' : 'go_maybe')}
              >
                <span class="chance-chip__dot" aria-hidden="true" />
                <span>{t('eligibleModeGoMaybe')}</span>
                <strong>{verdictCounts.GO + verdictCounts.MAYBE}</strong>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={eligibleMode === 'all'}
                class={`chance-chip ${eligibleMode === 'all' ? 'chance-chip--active' : ''}`}
                onClick={() => setEligibleMode('all')}
              >
                <span>{t('eligibleModeAll')}</span>
                <strong>{matchedEntries.length}</strong>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Search Input Bar */}
      <div class="search-bar">
        <div class="search-input-wrapper">
          <svg aria-hidden="true" class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            class="search-input"
            placeholder={t('scholarshipSearchPlaceholder')}
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
            aria-label={t('scholarshipSearchPlaceholder')}
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
      </div>

      <div class="scholarship-filters">
        <select
          class="filter-select"
          value={status}
          onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}
          aria-label={t('scholarshipStatusLabel')}
        >
          <option value="all">{t('scholarshipStatusLabel')}: {t('scholarshipFilterAll')}</option>
          <option value="open">{t('scholarshipOpen')}</option>
          <option value="upcoming">{t('scholarshipUpcoming')}</option>
          <option value="closed">{t('scholarshipClosed')}</option>
          <option value="discontinued">{t('scholarshipDiscontinued')}</option>
        </select>

        <select
          class="filter-select"
          value={degreeLevel}
          onChange={(e) => setDegreeLevel((e.target as HTMLSelectElement).value)}
          aria-label={t('scholarshipFilterDegree')}
        >
          <option value="all">{t('scholarshipFilterDegree')}: {t('scholarshipFilterAll')}</option>
          <option value="bachelor">{t('bachelor')}</option>
          <option value="masters">{t('masters')}</option>
          <option value="phd">{t('phd')}</option>
        </select>

        <select
          class="filter-select"
          value={country}
          onChange={(e) => setCountry((e.target as HTMLSelectElement).value)}
          aria-label={t('scholarshipFilterCountry')}
        >
          <option value="all">{t('scholarshipFilterCountry')}: {t('scholarshipFilterAll')}</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {localizePlace(c, lang)}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            class="pill-btn clear-filters-btn"
            onClick={resetFilters}
          >
            ✕ {t('clearAllFilters')}
          </button>
        )}
      </div>

      <div class="results-count-row">
        <div class="results-count" aria-live="polite">
          {tf('scholarshipsFound', { count: String(visibleEntries.length) })}
        </div>
        {viewMode === 'deadlines' && exportableCount > 0 && (
          <button type="button" class="pill-btn pill-btn--active" onClick={handleExportAllDeadlines}>
            📅 {t('deadlinesExportAll')} ({exportableCount})
          </button>
        )}
      </div>

      {visibleEntries.length === 0 ? (
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">🎓</span>
          <h3 class="empty-state__title">{t('scholarshipsEmpty')}</h3>
          <p class="empty-state__hint">{t('scholarshipsEmptyHint')}</p>
          {hasActiveFilters && (
            <button type="button" class="pill-btn empty-state__action" onClick={resetFilters}>
              {t('resetFilters')}
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        <div class="results-list">
          {visibleEntries.map(({ scholarship, match }) => (
            <ScholarshipCard key={scholarship.id} scholarship={scholarship} studentGpa={parsedGpa} match={match} />
          ))}
        </div>
      ) : (
        <div class="deadlines-timeline">
          {deadlineGroups.map(({ bucket, items }) => (
            <section key={bucket} class={`deadline-group deadline-group--${bucket}`}>
              <h3 class="deadline-group__title">
                <span>{t(BUCKET_TITLE_KEY[bucket])}</span>
                <span class="deadline-group__count">{items.length}</span>
              </h3>
              <div class="deadline-group__list">
                {items.map(({ scholarship, match, days }) => {
                  const title = localizedTitle(scholarship);
                  const saved = isWishlisted(scholarship.id);
                  const hasDate = !!scholarship.deadline && /^\d{4}-\d{2}-\d{2}$/.test(scholarship.deadline);
                  return (
                    <div key={scholarship.id} class="deadline-row">
                      <div class="deadline-row__date">
                        <strong>
                          {hasDate ? <bdi>{formatDate(scholarship.deadline!, lang)}</bdi> : t('deadlineTBA')}
                        </strong>
                        {days != null && !scholarship.deadline_estimated && (
                          <span class={`deadline-countdown deadline-countdown--${bucket}`}>
                            {tf('daysRemaining', { days })}
                          </span>
                        )}
                        {hasDate && scholarship.deadline_estimated && (
                          <span class="deadline-countdown deadline-countdown--estimated">{t('deadlineExpected')}</span>
                        )}
                      </div>
                      <div class="deadline-row__info">
                        <div class="deadline-row__title-line">
                          <span>{scholarship.country_flag}</span>
                          <strong>{title}</strong>
                          {match && (
                            <span class={`verdict-pill verdict-pill--${match.verdict.toLowerCase()}`}>
                              {match.verdict === 'GO' ? `✓ ${t('verdictGo')}` : match.verdict === 'MAYBE' ? `? ${t('verdictMaybe')}` : `✕ ${t('verdictNoGo')}`}
                            </span>
                          )}
                        </div>
                        <span class="deadline-row__sub">{scholarship.provider} • {localizePlace(scholarship.country, lang)}</span>
                      </div>
                      <div class="deadline-row__actions">
                        <button
                          type="button"
                          class={`bookmark-btn ${saved ? 'bookmark-btn--active' : ''}`}
                          onClick={() =>
                            toggleWishlist({
                              id: scholarship.id,
                              type: 'scholarship',
                              title,
                              subtitle: `${scholarship.provider} • ${localizePlace(scholarship.country, lang)}`,
                              location: scholarship.country,
                              score: scholarship.eligibility.min_gpa,
                              url: scholarship.application_url,
                              stage: 'saved',
                              raw: scholarship,
                              addedAt: Date.now()
                            })
                          }
                          aria-label={saved ? t('removeFromWishlist') : t('saveToWishlist')}
                          title={saved ? t('removeFromWishlist') : t('saveToWishlist')}
                        >
                          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        </button>
                        {hasDate && bucket !== 'closed' && (
                          <button
                            type="button"
                            class="pill-btn calendar-reminder-btn"
                            onClick={() => downloadScholarshipIcs(scholarship, title, localizedNotes(scholarship), t('deadlineExpected'))}
                            title={t('scholarshipAddCalendar')}
                          >
                            📅
                          </button>
                        )}
                        <a
                          href={scholarship.application_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="apply-btn"
                        >
                          {t('scholarshipApply')}
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
