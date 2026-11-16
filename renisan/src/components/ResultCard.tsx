import { useI18n } from '../hooks/useI18n';
import type { FederalCutoff, KRGCutoff } from '../lib/types';
import { localizePlace } from '../lib/places';

interface ResultCardProps {
  item: FederalCutoff | KRGCutoff;
  type: 'federal' | 'krg';
}

export function ResultCard({ item, type }: ResultCardProps) {
  const { lang, t } = useI18n();

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
  const getUniName = () => pickName(item.university, item.university_en, krg?.university_ku);
  const getCollegeName = () => pickName(item.college, item.college_en, krg?.college_ku);
  const getDeptName = () => pickName(item.department, item.department_en, krg?.department_ku);

  const score = fed ? fed.min_average : krg ? krg.min_composite_score : 0;
  const location = localizePlace(fed ? fed.governorate : krg ? krg.city : '', lang);
  const confidence = item.confidence || 'verified_third_party';

  const notes = krg ? (lang === 'ar' ? krg.notes_ar : krg.notes_ckb || krg.notes_ar) : null;

  return (
    <div class="result-card">
      <div class="result-card__top">
        <div class="result-card__institution">
          <span class="result-card__uni">{getUniName()} • {location}</span>
          <h3 class="result-card__college">{getCollegeName()}</h3>
          {getDeptName() && <span class="result-card__dept">{getDeptName()}</span>}
        </div>

        <div class="result-card__score-badge">
          <span class="result-card__score-label">{t('resultMinScore')}</span>
          <span class="result-card__score-val">{score.toFixed(1)}%</span>
        </div>
      </div>

      <div class="result-card__tags">
        <span class={`tag tag--${confidence}`}>
          {confidence === 'official' && t('resultConfidenceOfficial')}
          {confidence === 'verified_third_party' && t('resultConfidenceVerified')}
          {confidence === 'unverified' && t('resultConfidenceUnverified')}
        </span>

        <span class="tag">
          {item.stream === 'scientific' && t('streamScientific')}
          {item.stream === 'literary' && t('streamLiterary')}
          {item.stream === 'vocational' && t('streamVocational')}
        </span>

        <span class="tag">
          {item.study_type === 'morning' && t('studyTypeMorning')}
          {item.study_type === 'evening' && t('studyTypeEvening')}
          {item.study_type === 'parallel' && t('studyTypeParallel')}
          {item.study_type === 'government' && t('studyTypeGovernment')}
        </span>

        {fed && fed.channel && fed.channel !== 'general' && (
          <span class="tag tag--verified">
            {fed.channel === 'martyrs' && t('channelMartyrs')}
            {fed.channel === 'distinguished' && t('channelDistinguished')}
            {fed.channel === 'survivors' && t('channelSurvivors')}
          </span>
        )}

        {item.seats != null && item.seats > 0 && (
          <span class="tag">
            {t('resultSeats')}: {item.seats}
          </span>
        )}

        <span class="tag">
          {t('resultDataYear')} {item.year}
        </span>
      </div>

      {notes && (
        <div class="result-card__notes">
          ℹ️ {notes}
        </div>
      )}
    </div>
  );
}
