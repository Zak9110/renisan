import { useI18n } from '../hooks/useI18n';
import type { FederalCutoff, KRGCutoff } from '../lib/types';
import { ResultCard } from './ResultCard';
import { ShareButton } from './ShareButton';

interface ResultsListProps {
  federalResults: FederalCutoff[];
  krgResults: KRGCutoff[];
  system: 'federal' | 'krg';
  studentScore?: number | null;
  yearLabel?: string;
  /** Context for a helpful "no results" screen */
  emptyHelp?: {
    nearestCutoff: number | null;
    onClearSearch?: () => void;
    onShowReach?: () => void;
    onClearFilters?: () => void;
  };
}

export function ResultsList({ federalResults, krgResults, system, studentScore, yearLabel, emptyHelp }: ResultsListProps) {
  const { t } = useI18n();

  const isFederal = system === 'federal';
  const count = isFederal ? federalResults.length : krgResults.length;

  if (count === 0) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon" aria-hidden="true">🔍</span>
        <h3 class="empty-state__title">{t('resultsEmpty')}</h3>
        {emptyHelp?.nearestCutoff != null ? (
          <p class="empty-state__hint">
            {t('nearestProgram').replace('{score}', emptyHelp.nearestCutoff.toFixed(1))}
          </p>
        ) : (
          <p class="empty-state__hint">{t('resultsEmptyHint')}</p>
        )}
        <div class="empty-state__actions">
          {emptyHelp?.onClearSearch && (
            <button type="button" class="pill-btn" onClick={emptyHelp.onClearSearch}>✕ {t('clearSearch')}</button>
          )}
          {emptyHelp?.onShowReach && emptyHelp.nearestCutoff != null && studentScore != null &&
            emptyHelp.nearestCutoff - studentScore <= 2 && (
            <button type="button" class="pill-btn pill-btn--active" onClick={emptyHelp.onShowReach}>{t('showReachLabel')}</button>
          )}
          {emptyHelp?.onClearFilters && (
            <button type="button" class="pill-btn" onClick={emptyHelp.onClearFilters}>{t('resetFilters')}</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section class="results-section" aria-label={t('resultsTitle')}>
      <div class="results-header">
        <div class="results-count">
          <strong>{t('resultsTitle')}</strong> • {t('resultsCount').replace('{count}', String(count))}
        </div>
        <ShareButton resultsCount={count} />
      </div>

      <div class="results-list">
        {isFederal
          ? federalResults.map((item) => (
              <ResultCard key={item.id} item={item} type="federal" studentScore={studentScore} yearLabel={yearLabel} />
            ))
          : krgResults.map((item) => (
              <ResultCard key={item.id} item={item} type="krg" studentScore={studentScore} yearLabel={yearLabel} />
            ))}
      </div>
    </section>
  );
}
