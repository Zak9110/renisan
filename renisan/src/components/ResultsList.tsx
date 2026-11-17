import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import type { FederalCutoff, KRGCutoff } from '../lib/types';
import type { Trend } from '../lib/history';
import { fillTemplate } from '../lib/format';
import { ResultCard } from './ResultCard';
import { ShareButton } from './ShareButton';

/** Cards rendered before the "show more" button; low scores can match 1,000+ programmes. */
const PAGE_SIZE = 60;

interface ResultsListProps {
  federalResults: FederalCutoff[];
  krgResults: KRGCutoff[];
  system: 'federal' | 'krg';
  studentScore?: number | null;
  yearLabel?: string;
  /** Year-over-year history for a Federal row (null while history is still loading) */
  trendFor?: (item: FederalCutoff) => Trend | null;
  /** Context for a helpful "no results" screen */
  emptyHelp?: {
    nearestCutoff: number | null;
    onClearSearch?: () => void;
    onShowReach?: () => void;
    onClearFilters?: () => void;
  };
}

export function ResultsList({ federalResults, krgResults, system, studentScore, yearLabel, trendFor, emptyHelp }: ResultsListProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(PAGE_SIZE);

  const isFederal = system === 'federal';
  const count = isFederal ? federalResults.length : krgResults.length;

  // A new result set starts again from the first page
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [federalResults, krgResults]);

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

  const remaining = Math.max(0, count - visible);

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
          ? federalResults.slice(0, visible).map((item) => (
              <ResultCard
                key={item.id}
                item={item}
                type="federal"
                studentScore={studentScore}
                yearLabel={yearLabel}
                trend={trendFor ? trendFor(item) : null}
              />
            ))
          : krgResults.slice(0, visible).map((item) => (
              <ResultCard key={item.id} item={item} type="krg" studentScore={studentScore} yearLabel={yearLabel} />
            ))}
      </div>

      {remaining > 0 && (
        <div class="results-more">
          <button type="button" class="pill-btn pill-btn--active" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            {fillTemplate(t('showMoreResults'), { count: Math.min(PAGE_SIZE, remaining) })}
          </button>
        </div>
      )}
    </section>
  );
}
