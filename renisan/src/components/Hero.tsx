import { useI18n } from '../hooks/useI18n';
import { Icon } from './Icon';
import { fillTemplate } from '../lib/format';
import type { DatasetMeta } from '../lib/types';
import { LANGUAGES } from '../lib/i18n';

interface HeroProps {
  meta: DatasetMeta | null;
  cutoffCount: number;
  scholarshipCount: number;
}

/**
 * Front-page statement: what Renisan does, which official data it uses, and how much
 * of it there is. Counts come from the loaded datasets, so they stay true as data changes.
 */
export function Hero({ meta, cutoffCount, scholarshipCount }: HeroProps) {
  const { t, lang } = useI18n();
  const year = meta ? (lang === 'ar' && meta.federal.year_label_ar) || meta.federal.year_label : '';
  const nf = new Intl.NumberFormat('en-US');

  return (
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero__copy">
        {year && (
          <p class="hero__eyebrow">
            <Icon name="document" size={14} />
            <span>{fillTemplate(t('heroEyebrow'), { year })}</span>
          </p>
        )}
        <h2 id="hero-title" class="hero__title">{t('heroTitle')}</h2>
        <p class="hero__subtitle">{t('heroSubtitle')}</p>
      </div>

      <dl class="hero__stats">
        {cutoffCount > 0 && (
          <div class="hero__stat">
            <dt class="hero__stat-label">{t('statCutoffs')}</dt>
            <dd class="hero__stat-value">{nf.format(cutoffCount)}</dd>
          </div>
        )}
        {scholarshipCount > 0 && (
          <div class="hero__stat">
            <dt class="hero__stat-label">{t('statScholarships')}</dt>
            <dd class="hero__stat-value">{nf.format(scholarshipCount)}</dd>
          </div>
        )}
        <div class="hero__stat">
          <dt class="hero__stat-label">{t('statLanguages')}</dt>
          <dd class="hero__stat-value">{nf.format(LANGUAGES.length)}</dd>
        </div>
      </dl>
    </section>
  );
}
