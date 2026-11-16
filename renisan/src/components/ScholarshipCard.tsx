import { useI18n } from '../hooks/useI18n';
import type { Scholarship } from '../lib/types';
import { getEffectiveStatus, isDeadlinePassed } from '../lib/status';
import { localizePlace } from '../lib/places';

interface ScholarshipCardProps {
  scholarship: Scholarship;
}

export function ScholarshipCard({ scholarship }: ScholarshipCardProps) {
  const { lang, t } = useI18n();

  // Name based on locale
  const getLocalizedName = () => {
    if (lang === 'ckb' && scholarship.name_ckb) return scholarship.name_ckb;
    if (lang === 'kmr' && scholarship.name_kmr) return scholarship.name_kmr;
    return scholarship.name_ar || scholarship.name;
  };

  const getLocalizedNotes = () => {
    if (lang === 'ckb' && scholarship.notes_ckb) return scholarship.notes_ckb;
    if (lang === 'kmr' && scholarship.notes_kmr) return scholarship.notes_kmr;
    return scholarship.notes_ar;
  };

  // Effective status: a listing marked open/upcoming whose deadline has passed shows as closed
  const status = getEffectiveStatus(scholarship);
  const isDiscontinued = status === 'discontinued';
  const isClosed = status === 'closed';
  const deadlinePassed = isDeadlinePassed(scholarship);

  return (
    <article
      class={`scholarship-card ${isDiscontinued ? 'scholarship-card--discontinued' : ''}`}
      aria-labelledby={`sch-title-${scholarship.id}`}
    >
      <div class="scholarship-card__header">
        <div class="scholarship-card__title-group">
          <span class="scholarship-card__country">
            {scholarship.country_flag} {localizePlace(scholarship.country, lang)}
          </span>
          <h3 id={`sch-title-${scholarship.id}`} class="scholarship-card__title">
            {getLocalizedName()}
          </h3>
          <span class="scholarship-card__provider">{scholarship.provider}</span>
        </div>

        <span class={`status-pill status-pill--${status}`}>
          {status === 'open' && t('scholarshipOpen')}
          {status === 'closed' && t('scholarshipClosed')}
          {status === 'upcoming' && t('scholarshipUpcoming')}
          {status === 'discontinued' && t('scholarshipDiscontinued')}
        </span>
      </div>

      <div class="scholarship-card__meta-grid">
        <div class="meta-item">
          <span class="meta-item__label">{t('scholarshipFilterDegree')}</span>
          <span class="meta-item__value">
            {scholarship.degree_levels
              .map((lvl) => {
                if (lvl === 'bachelor') return t('bachelor');
                if (lvl === 'masters') return t('masters');
                if (lvl === 'phd') return t('phd');
                return lvl;
              })
              .join(' • ')}
          </span>
        </div>

        <div class="meta-item">
          <span class="meta-item__label">{t('scholarshipDeadline')}</span>
          <span class="meta-item__value" style={{ color: isClosed ? 'var(--color-danger)' : 'var(--color-text-accent)' }}>
            {scholarship.deadline || scholarship.deadline_note || '—'}
          </span>
          {deadlinePassed && (
            <span class="meta-item__hint">{t('scholarshipDeadlinePassed')}</span>
          )}
        </div>

        {scholarship.eligibility.min_gpa != null && (
          <div class="meta-item">
            <span class="meta-item__label">{t('scholarshipGPA')}</span>
            <span class="meta-item__value">{scholarship.eligibility.min_gpa}%</span>
          </div>
        )}

        {scholarship.eligibility.max_age != null && (
          <div class="meta-item">
            <span class="meta-item__label">{t('scholarshipAge')}</span>
            <span class="meta-item__value">≤ {scholarship.eligibility.max_age}</span>
          </div>
        )}
      </div>

      {/* Badges for refugee/survivor & exchange */}
      <div class="scholarship-card__covers">
        {scholarship.type === 'exchange' && (
          <span class="tag tag--verified">{t('scholarshipExchange')}</span>
        )}
        {scholarship.eligibility.refugee_idp_eligible && (
          <span class="tag tag--official">🛡️ {t('scholarshipRefugeeEligible')}</span>
        )}
        {scholarship.eligibility.survivor_eligible && (
          <span class="tag tag--official">✨ {t('scholarshipSurvivorEligible')}</span>
        )}
        {scholarship.acceptance_rate && (
          <span class="tag">
            {t('scholarshipAcceptanceRate')}: {scholarship.acceptance_rate}
          </span>
        )}
      </div>

      {/* Covers list */}
      {scholarship.covers && scholarship.covers.length > 0 && (
        <div class="scholarship-card__covers">
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
            {t('scholarshipCovers')}:
          </span>
          {scholarship.covers.map((c, i) => (
            <span key={i} class="cover-tag">
              ✓ {c}
            </span>
          ))}
        </div>
      )}

      {/* Notes / Notice */}
      {getLocalizedNotes() && (
        <div
          class="result-card__notes"
          style={{
            borderColor: isDiscontinued ? 'var(--color-danger)' : undefined,
            backgroundColor: isDiscontinued ? 'var(--color-danger-bg)' : undefined
          }}
        >
          {isDiscontinued ? '⚠️ ' : 'ℹ️ '}
          {getLocalizedNotes()}
        </div>
      )}

      {/* Footer & Apply */}
      <div class="scholarship-card__footer">
        <span class="scholarship-card__verified">
          {t('scholarshipLastVerified')}: {scholarship.last_verified} ({scholarship.verified_by})
        </span>

        {isDiscontinued ? (
          <span class="apply-btn apply-btn--disabled">{t('scholarshipDiscontinued')}</span>
        ) : (
          <a
            href={scholarship.application_url}
            target="_blank"
            rel="noopener noreferrer"
            class={`apply-btn ${isClosed ? 'apply-btn--secondary' : ''}`}
          >
            <span>{t('scholarshipApply')}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        )}
      </div>
    </article>
  );
}
