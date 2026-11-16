import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import type { FederalCutoff, KRGCutoff } from '../lib/types';
import { localizePlace } from '../lib/places';
import { isWishlisted, toggleWishlist, onWishlistChange } from '../lib/wishlist';
import { fillTemplate, formatAverage } from '../lib/format';

interface ResultCardProps {
  item: FederalCutoff | KRGCutoff;
  type: 'federal' | 'krg';
  studentScore?: number | null;
  /** Academic-year label of the dataset this row comes from (e.g. "2026-2027") */
  yearLabel?: string;
}

export function ResultCard({ item, type, studentScore, yearLabel }: ResultCardProps) {
  const { lang, t } = useI18n();
  const [bookmarked, setBookmarked] = useState(() => isWishlisted(item.id));

  useEffect(() => {
    return onWishlistChange(() => {
      setBookmarked(isWishlisted(item.id));
    });
  }, [item.id]);

  const isFederal = type === 'federal';
  const fed = isFederal ? (item as FederalCutoff) : null;
  const krg = !isFederal ? (item as KRGCutoff) : null;

  // Localized naming:
  //  - Sorani (Arabic script): Kurdish names where the dataset has them, else Arabic
  //  - Kurmanji (Latin script, LTR): English/Latin names so text direction stays consistent
  const pickName = (ar: string | null, en: string | null, ku: string | null | undefined): string | null => {
    if (lang === 'kmr') return en || ku || ar;
    if (lang === 'ckb') return ku || ar;
    return ar;
  };
  const uniName = pickName(item.university, item.university_en, item.university_ku);
  const collegeName = pickName(item.college, item.college_en, item.college_ku);
  const deptName = pickName(item.department, item.department_en, krg?.department_ku);
  const campus = fed ? (lang === 'kmr' ? fed.campus_en || fed.campus : fed.campus) : null;

  const score = fed ? fed.min_average : krg ? krg.min_composite_score : 0;
  const location = localizePlace(fed ? fed.governorate : krg ? krg.city : '', lang);
  const confidence = item.confidence || 'verified_third_party';
  const isInstitute = fed?.level === 'institute';

  const notes = krg ? (lang === 'ar' ? krg.notes_ar : krg.notes_ckb || krg.notes_ar) : null;

  // Delta calculation relative to student score
  const scoreDiff = studentScore != null ? Number((studentScore - score).toFixed(2)) : null;
  const isReach = scoreDiff != null && scoreDiff < 0;

  const handleToggleWishlist = () => {
    toggleWishlist({
      id: item.id,
      type,
      title: collegeName || '',
      subtitle: `${uniName}${deptName ? ` • ${deptName}` : ''}${campus ? ` • ${campus}` : ''}`,
      location,
      score,
      studyType: item.study_type,
      channel: fed?.channel,
      raw: item,
      addedAt: Date.now()
    });
  };

  return (
    <div class={`result-card ${isReach ? 'result-card--reach' : ''}`}>
      <div class="result-card__top">
        <div class="result-card__institution">
          <div class="result-card__meta-bar">
            <span class="result-card__uni">{uniName} • {location}</span>
          </div>
          <h3 class="result-card__college">{collegeName}</h3>
          {deptName && <span class="result-card__dept">{deptName}</span>}
          {campus && (
            <span class="result-card__campus">
              {t('campusLabel')}: <bdi>{campus}</bdi>
              {fed?.program_length && <bdi> ({fed.program_length})</bdi>}
            </span>
          )}
        </div>

        <div class="result-card__score-area">
          <div class="result-card__score-badge">
            <span class="result-card__score-label">{t('resultMinScore')}</span>
            <span class="result-card__score-val">
              <bdi>{formatAverage(score)}%</bdi>
            </span>
            {fed?.min_score != null && (
              <span class="result-card__score-sub">
                {t('resultTotalScore')}: <bdi>{formatAverage(fed.min_score)}</bdi>
              </span>
            )}
          </div>

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

      {/* Delta pill showing safety margin */}
      {scoreDiff != null && (
        <div class="result-card__delta-row">
          {scoreDiff >= 2.0 && (
            <span class="delta-badge delta-badge--safe">
              <span class="delta-badge__dot" />
              <bdi>+{scoreDiff.toFixed(1)}%</bdi> · {t('scoreDeltaSafe')}
            </span>
          )}
          {scoreDiff >= 0 && scoreDiff < 2.0 && (
            <span class="delta-badge delta-badge--target">
              <span class="delta-badge__dot" />
              <bdi>+{scoreDiff.toFixed(1)}%</bdi> · {t('scoreDeltaTarget')}
            </span>
          )}
          {scoreDiff < 0 && (
            <span class="delta-badge delta-badge--reach">
              <span class="delta-badge__dot" />
              <bdi>{scoreDiff.toFixed(1)}%</bdi> · {t('scoreDeltaReach')}
            </span>
          )}
        </div>
      )}

      <div class="result-card__tags">
        <span class={`tag tag--${confidence}`}>
          {confidence === 'official' && t('resultConfidenceOfficial')}
          {confidence === 'verified_third_party' && t('resultConfidenceVerified')}
          {confidence === 'unverified' && t('resultConfidenceUnverified')}
        </span>

        <span class="tag">
          {item.study_type === 'morning' && t('studyTypeMorning')}
          {item.study_type === 'evening' && t('studyTypeEvening')}
          {item.study_type === 'parallel' && t('studyTypeParallel')}
          {item.study_type === 'government' && t('studyTypeGovernment')}
        </span>

        {isInstitute && <span class="tag tag--institute">{t('levelInstitute')}</span>}

        {item.gender === 'female' && <span class="tag tag--female">{t('tagFemaleOnly')}</span>}
        {item.gender === 'male' && <span class="tag tag--male">{t('tagMaleOnly')}</span>}

        {fed && fed.channel && fed.channel !== 'general' && (
          <span class="tag tag--verified">
            {fed.channel === 'martyrs' && t('channelMartyrs')}
            {fed.channel === 'distinguished' && t('channelDistinguished')}
            {fed.channel === 'survivors' && t('channelSurvivors')}
            {fed.channel === 'medical_free' && t('channelMedicalFree')}
          </span>
        )}

        {item.seats != null && item.seats > 0 && (
          <span class="tag">
            {t('resultSeats')}: {item.seats}
          </span>
        )}

        {yearLabel && <span class="tag tag--year">{fillTemplate(t('dataYearTag'), { year: yearLabel })}</span>}
      </div>

      {notes && (
        <div class="result-card__notes" dir="auto">
          <span aria-hidden="true">ℹ️</span> <bdi>{notes}</bdi>
        </div>
      )}
    </div>
  );
}
