import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import type { Scholarship } from '../lib/types';
import { getEffectiveStatus, isDeadlinePassed } from '../lib/status';
import { localizePlace } from '../lib/places';
import { isWishlisted, toggleWishlist, onWishlistChange } from '../lib/wishlist';
import { downloadScholarshipIcs } from '../lib/calendar';
import { fillTemplate, formatDate } from '../lib/format';
import { pickLocalized, type TranslationKeys } from '../lib/i18n';
import type { MatchReason, MatchReasonCode, MatchResult } from '../lib/matcher';

interface ScholarshipCardProps {
  scholarship: Scholarship;
  studentGpa?: number;
  match?: MatchResult | null;
}

const REASON_KEY: Record<MatchReasonCode, keyof TranslationKeys> = {
  closed_or_discontinued: 'reasonDiscontinued',
  degree_ok: 'reasonDegreeOk',
  degree_fail: 'reasonDegreeFail',
  undergrad_enrolled_required: 'reasonUndergradEnrolled',
  gpa_ok: 'reasonGpaOk',
  gpa_fail: 'reasonGpaFail',
  gpa_missing: 'reasonGpaMissing',
  age_ok: 'reasonAgeOk',
  age_borderline: 'reasonAgeBorderline',
  age_fail: 'reasonAgeFail',
  age_missing: 'reasonAgeMissing',
  work_exp_ok: 'reasonWorkExpOk',
  work_exp_fail: 'reasonWorkExpFail',
  work_exp_missing: 'reasonWorkExpMissing',
  return_fail: 'reasonReturnFail',
  gender_fail: 'reasonGenderFail',
  english_ok: 'reasonEnglishOk',
  english_check: 'reasonEnglishCheck',
  refugee_fit: 'reasonRefugeeFit',
  survivor_fit: 'reasonSurvivorFit'
};

export function ScholarshipCard({ scholarship, studentGpa, match }: ScholarshipCardProps) {
  const { lang, t, tf } = useI18n();
  const [bookmarked, setBookmarked] = useState(() => isWishlisted(scholarship.id));

  useEffect(() => {
    return onWishlistChange(() => {
      setBookmarked(isWishlisted(scholarship.id));
    });
  }, [scholarship.id]);

  // Name based on locale
  const getLocalizedName = () =>
    pickLocalized(lang, { ar: scholarship.name_ar, ckb: scholarship.name_ckb, kmr: scholarship.name_kmr, en: scholarship.name }) ?? scholarship.name;

  const getLocalizedNotes = () =>
    pickLocalized(lang, { ar: scholarship.notes_ar, ckb: scholarship.notes_ckb, kmr: scholarship.notes_kmr, en: scholarship.notes_en });

  const formatReason = (r: MatchReason) => {
    const tpl = t(REASON_KEY[r.code]);
    return r.params ? fillTemplate(tpl, r.params) : tpl;
  };

  // Effective status: a listing marked open/upcoming whose deadline has passed shows as closed
  const status = getEffectiveStatus(scholarship);
  const pick = <T,>(ar: T, ckb?: T, kmr?: T, en?: T): T | undefined => pickLocalized(lang, { ar, ckb, kmr, en });
  const covers = pick(scholarship.covers, scholarship.covers_ckb, scholarship.covers_kmr, scholarship.covers_en) ?? [];
  const deadlineNote = pick(scholarship.deadline_note, scholarship.deadline_note_ckb, scholarship.deadline_note_kmr, scholarship.deadline_note_en);
  const acceptanceRate = pick(scholarship.acceptance_rate, undefined, undefined, scholarship.acceptance_rate_en);
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
      stage: 'saved',
      raw: scholarship,
      addedAt: Date.now()
    });
  };

  const verdictClass = match ? `scholarship-card--verdict-${match.verdict.toLowerCase()}` : '';

  return (
    <article
      class={`scholarship-card ${isDiscontinued ? 'scholarship-card--discontinued' : ''} ${verdictClass}`}
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
          {match && (
            <span class={`verdict-pill verdict-pill--${match.verdict.toLowerCase()}`}>
              {match.verdict === 'GO' ? `✓ ${t('verdictGo')}` : match.verdict === 'MAYBE' ? `? ${t('verdictMaybe')}` : `✕ ${t('verdictNoGo')}`}
            </span>
          )}
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

      {/* Explainable eligibility reasons */}
      {match && (match.failed.length > 0 || match.missing.length > 0 || match.passed.length > 0) && (
        <div class="match-reasons" aria-label={t('scholarshipEligibility')}>
          {match.failed.map((r, i) => (
            <span key={`f-${i}`} class="match-reason match-reason--fail">
              ✕ {formatReason(r)}
            </span>
          ))}
          {match.missing.map((r, i) => (
            <span key={`m-${i}`} class="match-reason match-reason--missing">
              ? {formatReason(r)}
            </span>
          ))}
          {match.passed.map((r, i) => (
            <span key={`p-${i}`} class="match-reason match-reason--pass">
              ✓ {formatReason(r)}
            </span>
          ))}
        </div>
      )}

      {daysRemaining != null && daysRemaining <= 30 && (
        <div class="scholarship-card__urgency-banner">
          <span class="urgency-pill">
            ⏰ {daysRemaining <= 7 ? t('deadlineUrgent') : ''} ({tf('daysRemaining', { days: daysRemaining })})
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
              <bdi>{formatDate(scholarship.deadline!, lang)}</bdi>
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

      {/* Badges for refugee/survivor & exchange & GPA match */}
      <div class="scholarship-card__covers">
        {!match && studentGpa != null && scholarship.eligibility.min_gpa != null && (
          <span class={`tag ${studentGpa >= scholarship.eligibility.min_gpa ? 'tag--official' : 'tag--unverified'}`}>
            {fillTemplate(
              t(studentGpa >= scholarship.eligibility.min_gpa ? 'scholarshipGpaMatch' : 'scholarshipGpaShort'),
              { gpa: scholarship.eligibility.min_gpa }
            )}
          </span>
        )}
        {scholarship.type === 'exchange' && (
          <span class="tag tag--verified">{t('scholarshipExchange')}</span>
        )}
        {scholarship.eligibility.refugee_idp_eligible && (
          <span class="tag tag--official">🛡️ {t('scholarshipRefugeeEligible')}</span>
        )}
        {scholarship.eligibility.survivor_eligible && (
          <span class="tag tag--official">✨ {t('scholarshipSurvivorEligible')}</span>
        )}
        {acceptanceRate && (
          <span class="tag">
            {t('scholarshipAcceptanceRate')}: {acceptanceRate}
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
          <div class="scholarship-card__footer-actions">
            {hasDate && !deadlinePassed && (
              <button
                type="button"
                class="pill-btn calendar-reminder-btn"
                onClick={() => downloadScholarshipIcs(scholarship, getLocalizedName(), getLocalizedNotes(), t('deadlineExpected'))}
                title={t('scholarshipAddCalendar')}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>{t('scholarshipAddCalendar')}</span>
              </button>
            )}
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
          </div>
        )}
      </div>
    </article>
  );
}
