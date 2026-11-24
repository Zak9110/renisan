import { useState, useEffect } from 'preact/hooks';
import { Icon } from './Icon';
import { useI18n } from '../hooks/useI18n';
import type { FederalCutoff, KRGCutoff } from '../lib/types';
import { localizePlace } from '../lib/places';
import { pickLocalized } from '../lib/i18n';
import { isWishlisted, toggleWishlist, onWishlistChange } from '../lib/wishlist';
import { fillTemplate, formatAverage, formatDelta } from '../lib/format';
import { chanceBand, type ChanceBand } from '../lib/chance';
import type { Trend } from '../lib/history';

interface ResultCardProps {
  item: FederalCutoff | KRGCutoff;
  type: 'federal' | 'krg';
  studentScore?: number | null;
  /** Academic-year label of the dataset this row comes from (e.g. "2026-2027") */
  yearLabel?: string;
  /** Prior-year cutoffs for the same programme (Federal only; null while loading) */
  trend?: Trend | null;
  /** Sibling channels or study types for the same university + college + department */
  siblings?: (FederalCutoff | KRGCutoff)[];
}

/** Tiny inline chart of this programme's cutoff over the years (oldest → current). */
function Sparkline({ values, title }: { values: number[]; title: string }) {
  if (values.length < 2) return null;
  const w = 48;
  const h = 18;
  const pad = 2.5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    pad + (i * (w - 2 * pad)) / (values.length - 1),
    h - pad - ((v - min) / span) * (h - 2 * pad)
  ]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg class="sparkline" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={title} dir="ltr">
      <title>{title}</title>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx={lx} cy={ly} r="2.25" fill="currentColor" />
    </svg>
  );
}

const BAND_LABEL: Record<ChanceBand, 'scoreDeltaSafe' | 'scoreDeltaTarget' | 'scoreDeltaReach'> = {
  safe: 'scoreDeltaSafe',
  target: 'scoreDeltaTarget',
  reach: 'scoreDeltaReach'
};

export function ResultCard({ item, type, studentScore, yearLabel, trend, siblings = [] }: ResultCardProps) {
  const { lang, t } = useI18n();
  const [bookmarked, setBookmarked] = useState(() => isWishlisted(item.id));
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    return onWishlistChange(() => {
      setBookmarked(isWishlisted(item.id));
    });
  }, [item.id]);

  const isFederal = type === 'federal';
  const fed = isFederal ? (item as FederalCutoff) : null;
  const krg = !isFederal ? (item as KRGCutoff) : null;

  // Localized naming: datasets carry Arabic, Sorani ("ku") and English/Latin names.
  // Kurmanji readers get the Latin names so text direction stays consistent.
  const pickName = (ar: string | null, en: string | null, ku: string | null | undefined): string | null =>
    pickLocalized(lang, { ar, ckb: ku, kmr: en, en }) ?? null;
  const uniName = pickName(item.university, item.university_en, item.university_ku);
  const collegeName = pickName(item.college, item.college_en, item.college_ku);
  const deptName = pickName(item.department, item.department_en, krg?.department_ku);
  const campus = fed ? pickName(fed.campus ?? null, fed.campus_en ?? null, null) : null;

  const score = fed ? fed.min_average : krg ? krg.min_composite_score : 0;
  const location = localizePlace(fed ? fed.governorate : krg ? krg.city : '', lang);
  const confidence = item.confidence || 'verified_third_party';
  const isInstitute = fed?.level === 'institute';

  const notes = krg
    ? pickLocalized(lang, { ar: krg.notes_ar, ckb: krg.notes_ckb, en: krg.notes_en }) ?? null
    : null;

  const scoreDiff = studentScore != null ? Number((studentScore - score).toFixed(2)) : null;
  const band = scoreDiff != null ? chanceBand(scoreDiff) : null;
  const totalMarksDiff = isFederal && scoreDiff != null ? Number((scoreDiff * 7).toFixed(1)) : null;
  const hasDetails = (trend && trend.series.length > 0) || siblings.length > 0 || totalMarksDiff != null;

  const yearText = (label: string, labelAr?: string) => (lang === 'ar' && labelAr) || label;

  const siblingLabel = (s: FederalCutoff | KRGCutoff) => {
    if ('min_average' in s) {
      const ch =
        s.channel === 'distinguished' ? t('channelDistinguished') :
        s.channel === 'martyrs' ? t('channelMartyrs') :
        s.channel === 'survivors' ? t('channelSurvivors') :
        s.channel === 'medical_free' ? t('channelMedicalFree') :
        t('channelGeneral');
      const st = s.study_type === 'evening' ? t('studyTypeEvening') : s.study_type === 'parallel' ? t('studyTypeParallel') : t('studyTypeMorning');
      return `${ch} · ${st}`;
    }
    return s.study_type === 'parallel' ? t('studyTypeParallel') : s.study_type === 'evening' ? t('studyTypeEvening') : t('studyTypeGovernment');
  };

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

  // Trend line: direction vs last year + sparkline of all known years
  let trendNode = null;
  if (fed && trend) {
    if (trend.previous && trend.delta != null) {
      const dir = trend.delta > 0.004 ? 'up' : trend.delta < -0.004 ? 'down' : 'same';
      const prevLabel = yearText(trend.previous.year_label, trend.previous.year_label_ar);
      const text = dir === 'up' ? t('trendUp') : dir === 'down' ? t('trendDown') : t('trendSame');
      const history = trend.series
        .map((p) => fillTemplate(t('trendPrev'), { year: yearText(p.year_label, p.year_label_ar), score: formatAverage(p.value) }))
        .join(' · ');
      const sentence = fillTemplate(text, { delta: Math.abs(trend.delta).toFixed(2), year: prevLabel });
      trendNode = (
        <span class={`trend trend--${dir}`} title={`${sentence} — ${history}`}>
          <Sparkline values={[...trend.series.map((p) => p.value), score]} title={`${t('trendLabel')}: ${history}`} />
          <span class="trend__text" aria-label={sentence}>
            <span aria-hidden="true">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='}{' '}<bdi dir="ltr">{dir === 'same' ? '0' : Math.abs(trend.delta).toFixed(2)}</bdi></span>
          </span>
          <span class="trend__prev">
            <bdi>{fillTemplate(t('trendPrev'), { year: prevLabel, score: formatAverage(trend.previous.value) })}</bdi>
          </span>
        </span>
      );
    } else {
      trendNode = <span class="trend trend--new">{t('trendNew')}</span>;
    }
  }

  return (
    <article class={`result-card ${band ? `result-card--${band}` : ''}`}>
      <div class="result-card__top">
        <div class="result-card__institution">
          <span class="result-card__uni">
            {uniName}
            <span class="result-card__sep" aria-hidden="true"> · </span>
            {location}
          </span>
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
              <bdi>{formatAverage(score)}</bdi>
            </span>
            {fed?.min_score != null && (
              <span class="result-card__score-sub">
                {t('resultTotalScore')} <bdi>{formatAverage(fed.min_score)}</bdi>
              </span>
            )}
          </div>

          <button
            type="button"
            class={`bookmark-btn ${bookmarked ? 'bookmark-btn--active' : ''}`}
            onClick={handleToggleWishlist}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? t('removeFromWishlist') : t('saveToWishlist')}
            title={bookmarked ? t('removeFromWishlist') : t('saveToWishlist')}
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </div>

      <div class="result-card__meta">
        {band && scoreDiff != null && (
          <span class={`delta-badge delta-badge--${band}`}>
            <span class="delta-badge__dot" aria-hidden="true" />
            <bdi dir="ltr">{formatDelta(scoreDiff)}</bdi>
            <span>{t(BAND_LABEL[band])}</span>
          </span>
        )}

        {trendNode}

        {/* Only tags that tell programmes apart; dataset-wide facts live in the note above the form */}
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
        {krg && (
          <span class="tag">
            {item.study_type === 'parallel' ? t('studyTypeParallel') : item.study_type === 'evening' ? t('studyTypeEvening') : t('studyTypeGovernment')}
          </span>
        )}
        {fed && fed.study_type !== 'morning' && (
          <span class="tag">{fed.study_type === 'evening' ? t('studyTypeEvening') : t('studyTypeParallel')}</span>
        )}
        {confidence !== 'official' && (
          <span class={`tag tag--${confidence}`}>
            {confidence === 'verified_third_party' ? t('resultConfidenceVerified') : t('resultConfidenceUnverified')}
          </span>
        )}
        {item.seats != null && item.seats > 0 && (
          <span class="tag">{t('resultSeats')}: {item.seats}</span>
        )}
        {krg && yearLabel && <span class="tag tag--year">{fillTemplate(t('dataYearTag'), { year: yearLabel })}</span>}

        {hasDetails && (
          <button
            type="button"
            class="details-toggle-btn"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen(!detailsOpen)}
          >
            <span>{detailsOpen ? t('detailsHide') : t('detailsShow')}</span>
            <span aria-hidden="true">{detailsOpen ? '▲' : '▼'}</span>
          </button>
        )}
      </div>

      {detailsOpen && hasDetails && (
        <div class="result-card__details fade-in">
          {totalMarksDiff != null && (
            <div class="details-row details-row--marks">
              <span>📊 {fillTemplate(t('detailsTotalDiff'), { marks: formatDelta(totalMarksDiff) })}</span>
            </div>
          )}

          {trend && trend.series.length > 0 && (
            <div class="details-block">
              <h4 class="details-block__title">{t('detailsHistoryTitle')}</h4>
              <div class="details-chips">
                {trend.series.map((p) => (
                  <span key={p.year} class="details-chip">
                    <bdi>{yearText(p.year_label, p.year_label_ar)}</bdi>: <strong><bdi>{formatAverage(p.value)}%</bdi></strong>
                  </span>
                ))}
                {yearLabel && (
                  <span class="details-chip details-chip--current">
                    <bdi>{yearLabel}</bdi>: <strong><bdi>{formatAverage(score)}%</bdi></strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {siblings.length > 0 && (
            <div class="details-block">
              <h4 class="details-block__title">{t('detailsSiblingsTitle')}</h4>
              <div class="details-chips">
                {siblings.map((sib) => {
                  const sibScore = 'min_average' in sib ? sib.min_average : sib.min_composite_score;
                  return (
                    <span key={sib.id} class="details-chip">
                      <span>{siblingLabel(sib)}:</span> <strong><bdi>{formatAverage(sibScore)}%</bdi></strong>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {notes && (
        <div class="result-card__notes" dir="auto">
          <Icon name="info" size={14} class="inline-icon" /> <bdi>{notes}</bdi>
        </div>
      )}
    </article>
  );
}
