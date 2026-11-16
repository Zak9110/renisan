import { useI18n } from '../hooks/useI18n';
import type { FederalCutoff, KRGCutoff } from '../lib/types';
import { ResultCard } from './ResultCard';
import { ShareButton } from './ShareButton';

interface ResultsListProps {
  federalResults: FederalCutoff[];
  krgResults: KRGCutoff[];
  system: 'federal' | 'krg';
}

export function ResultsList({ federalResults, krgResults, system }: ResultsListProps) {
  const { t } = useI18n();

  const isFederal = system === 'federal';
  const count = isFederal ? federalResults.length : krgResults.length;

  if (count === 0) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon" aria-hidden="true">🔍</span>
        <h3 class="empty-state__title">{t('resultsEmpty')}</h3>
        <p class="empty-state__hint">{t('resultsEmptyHint')}</p>
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
              <ResultCard key={item.id} item={item} type="federal" />
            ))
          : krgResults.map((item) => (
              <ResultCard key={item.id} item={item} type="krg" />
            ))}
      </div>
    </section>
  );
}
