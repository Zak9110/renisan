import { useState, useMemo } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import type { Scholarship, ScholarshipFilters } from '../lib/types';
import { filterScholarships, getUniqueCountries } from '../lib/search';
import { ScholarshipCard } from './ScholarshipCard';
import { localizePlace } from '../lib/places';

interface ScholarshipDirectoryProps {
  scholarships: Scholarship[];
}

export function ScholarshipDirectory({ scholarships }: ScholarshipDirectoryProps) {
  const { t, lang } = useI18n();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [status, setStatus] = useState<string>('all');
  const [degreeLevel, setDegreeLevel] = useState<string>('all');
  const [country, setCountry] = useState<string>('all');
  const [refugeeOnly, setRefugeeOnly] = useState<boolean>(false);

  const countries = useMemo(() => getUniqueCountries(scholarships), [scholarships]);

  const filteredList = useMemo(() => {
    const filters: ScholarshipFilters = {
      status: status === 'all' ? undefined : status,
      degree_level: degreeLevel === 'all' ? undefined : degreeLevel,
      country: country === 'all' ? undefined : country,
      refugee_eligible: refugeeOnly ? true : undefined,
      search: searchQuery.trim() !== '' ? searchQuery : undefined
    };
    return filterScholarships(scholarships, filters);
  }, [scholarships, status, degreeLevel, country, refugeeOnly, searchQuery]);

  const hasActiveFilters = searchQuery.trim() !== '' || status !== 'all' || degreeLevel !== 'all' || country !== 'all' || refugeeOnly;

  const resetFilters = () => {
    setSearchQuery('');
    setStatus('all');
    setDegreeLevel('all');
    setCountry('all');
    setRefugeeOnly(false);
  };

  return (
    <div class="scholarships-container">
      <div class="scholarships-hero">
        <h2 class="scholarships-hero__title">{t('scholarshipsTitle')}</h2>
        <p class="scholarships-hero__subtitle">{t('scholarshipsSubtitle')}</p>
      </div>

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

        <label class="filter-checkbox">
          <input
            type="checkbox"
            checked={refugeeOnly}
            onChange={(e) => setRefugeeOnly((e.target as HTMLInputElement).checked)}
          />
          <span>{t('scholarshipRefugeeEligible')}</span>
        </label>

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

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div class="active-filter-chips">
          <span class="active-filter-chips__label">{t('activeFiltersLabel')}</span>
          {searchQuery && (
            <span class="filter-chip">
              "{searchQuery}"
              <button type="button" aria-label={t('close')} onClick={() => setSearchQuery('')}>✕</button>
            </span>
          )}
          {status !== 'all' && (
            <span class="filter-chip">
              {status === 'open' ? t('scholarshipOpen') : status === 'closed' ? t('scholarshipClosed') : status === 'upcoming' ? t('scholarshipUpcoming') : t('scholarshipDiscontinued')}
              <button type="button" aria-label={t('close')} onClick={() => setStatus('all')}>✕</button>
            </span>
          )}
          {degreeLevel !== 'all' && (
            <span class="filter-chip">
              {degreeLevel === 'bachelor' ? t('bachelor') : degreeLevel === 'masters' ? t('masters') : t('phd')}
              <button type="button" aria-label={t('close')} onClick={() => setDegreeLevel('all')}>✕</button>
            </span>
          )}
          {country !== 'all' && (
            <span class="filter-chip">
              {localizePlace(country, lang)}
              <button type="button" aria-label={t('close')} onClick={() => setCountry('all')}>✕</button>
            </span>
          )}
          {refugeeOnly && (
            <span class="filter-chip">
              🛡️ {t('scholarshipRefugeeEligible')}
              <button type="button" aria-label={t('close')} onClick={() => setRefugeeOnly(false)}>✕</button>
            </span>
          )}
        </div>
      )}

      <div class="results-count" aria-live="polite">
        {t('scholarshipsFound').replace('{count}', String(filteredList.length))}
      </div>

      {filteredList.length === 0 ? (
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
      ) : (
        <div class="results-list">
          {filteredList.map((scholarship) => (
            <ScholarshipCard key={scholarship.id} scholarship={scholarship} />
          ))}
        </div>
      )}
    </div>
  );
}
