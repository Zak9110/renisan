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
      refugee_eligible: refugeeOnly ? true : undefined
    };
    return filterScholarships(scholarships, filters);
  }, [scholarships, status, degreeLevel, country, refugeeOnly]);

  const hasActiveFilters = status !== 'all' || degreeLevel !== 'all' || country !== 'all' || refugeeOnly;

  const resetFilters = () => {
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
      </div>

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
