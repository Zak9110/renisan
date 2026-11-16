import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import type { Scholarship } from '../lib/types';
import { getEffectiveStatus, isDeadlinePassed } from '../lib/status';
import { localizePlace } from '../lib/places';
import { isWishlisted, toggleWishlist, onWishlistChange } from '../lib/wishlist';

interface ScholarshipCardProps {
  scholarship: Scholarship;
}

export function ScholarshipCard({ scholarship }: ScholarshipCardProps) {
  const { lang, t } = useI18n();
  const [bookmarked, setBookmarked] = useState(() => isWishlisted(scholarship.id));

  useEffect(() => {
    return onWishlistChange(() => {
      setBookmarked(isWishlisted(scholarship.id));
    });
  }, [scholarship.id]);

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
  const pick = <T,>(ar: T, ckb?: T, kmr?: T): T =>
    (lang === 'ckb' && ckb) || (lang === 'kmr' && kmr) || ar;
  const covers = pick(scholarship.covers, scholarship.covers_ckb, scholarship.covers_kmr) ?? [];
  const deadlineNote = pick(scholarship.deadline_note, scholarship.deadline_note_ckb, scholarship.deadline_note_kmr);
  const hasDate = !!scholarship.deadline && /^\d{4}-\d{2}-\d{2}$/.test(scholarship.deadline);

  const isDiscontinued = status === 'discontinued';
  const isClosed = status === 'closed';
  const deadlinePassed = isDeadlinePassed(scholarship);

  // Calculate days remaining if open and deadline is set
  let daysRemaining: number | null = null;
  if (hasDate && !deadlinePassed && status === 'open' && !scholarship.deadline_estimated) {
    const [y, m, d] = scholarship.deadline!.split('-').map(Number);
    const deadlineDate = new Date(y, m - 1, d, 23, 59, 59);
    const diffMs = deadlineDate.getTime() - Date.now();
    if (diffMs > 0) {
      daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  const handleToggleWishlist = () => {
    toggleWishlist({
      id: scholarship.id,
      type: 'scholarship',
      title: getLocalizedName(),
      subtitle: `${scholarship.provider} • ${localizePlace(scholarship.country, lang)}`,
      location: scholarship.country,
      score: scholarship.eligibility.min_gpa,
      url: scholarship.application_url,
      raw: scholarship,
      addedAt: Date.now()
    });
  };

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

        <div class="scholarship-card__actions-top">
          <span class={`status-pill status-pill--${status}`}>
            {status === 'open' && t('scholarshipOpen')}
            {status === 'closed' && t('scholarshipClosed')}
            {status === 'upcoming' && t('scholarshipUpcoming')}
            {status === 'discontinued' && t('scholarshipDiscontinued')}
          </span>

          <button
            type="button"
            class={`bookmark-btn ${bookmarked ? 'bookmark-btn--active' : ''}`}
            onClick={handleToggleWishlist}
            aria-label={bookmarked ? t('removeFromWishlist') : t('saveToWishlist')}
            title={bookmarked ? t('removeFromWishlist') : t('saveToWishlist')}
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </div>

      {daysRemaining != null && daysRemaining <= 30 && (
        <div class="scholarship-card__urgency-banner">
          <span class="urgency-pill">
            ⏰ {daysRemaining <= 7 ? t('deadlineUrgent') : ''} ({t('daysRemaining').replace('{days}', String(daysRemaining))})
          </span>
        </div>
      )}

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
            {hasDate ? (
              <bdi>{scholarship.deadline}</bdi>
            ) : isDiscontinued ? t('scholarshipDiscontinued') : t('deadlineTBA')}
            {hasDate && scholarship.deadline_estimated && !deadlinePassed && (
              <span class="deadline-estimated"> ({t('deadlineExpected')})</span>
            )}
          </span>
          {deadlinePassed ? (
            <span class="meta-item__hint">{t('scholarshipDeadlinePassed')}</span>
          ) : deadlineNote ? (
            <span class="meta-item__hint">{deadlineNote}</span>
          ) : null}
        </div>

        {scholarship.eligibility.min_gpa != null && (
          <div class="meta-item">
            <span class="meta-item__label">{t('scholarshipGPA')}</span>
            <span class="meta-item__value"><bdi>{scholarship.eligibility.min_gpa}%</bdi></span>
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
      {covers.length > 0 && (
        <div class="scholarship-card__covers">
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
            {t('scholarshipCovers')}:
          </span>
          {covers.map((c, i) => (
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
          <span aria-hidden="true">{isDiscontinued ? '⚠️' : 'ℹ️'}</span>{' '}
          <bdi>{getLocalizedNotes()}</bdi>
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
