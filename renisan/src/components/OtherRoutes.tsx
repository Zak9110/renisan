import { useState, useMemo } from 'preact/hooks';
import { Icon } from './Icon';
import { useI18n } from '../hooks/useI18n';
import type { FederalRules, RouteMinimum, RouteStream } from '../lib/types';
import { fillTemplate, formatAverage } from '../lib/format';
import { pickLocalized } from '../lib/i18n';

interface OtherRoutesProps {
  rules: FederalRules;
  score: number;
  stream: 'scientific' | 'literary' | 'vocational';
  yearLabel: string;
}

type RouteKey = 'gov_evening' | 'private_morning' | 'private_evening';
const ROUTE_KEYS: RouteKey[] = ['gov_evening', 'private_morning', 'private_evening'];

/**
 * Rule-based routes the official cutoff list does not cover: government evening
 * study and private colleges. The ministry publishes a minimum average to *apply*
 * per field, so eligibility here is a yes/no against that floor, not a prediction.
 */
export function OtherRoutes({ rules, score, stream, yearLabel }: OtherRoutesProps) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [onlyEligible, setOnlyEligible] = useState(false);

  // Vocational graduates compete on the shared (scientific) minimums per the guide, +2 points
  const column: RouteStream = stream === 'literary' ? 'literary' : 'scientific';
  const bump = stream === 'vocational' ? 2 : 0;

  const name = (r: { ar: string; en: string; ckb: string; kmr: string }) => pickLocalized(lang, r) ?? r.ar;
  const routeLabel: Record<RouteKey, string> = {
    gov_evening: t('routesGovEvening'),
    private_morning: t('routesPrivateMorning'),
    private_evening: t('routesPrivateEvening')
  };

  const minFor = (r: RouteMinimum, key: RouteKey): number | null => {
    const v = r[key][column];
    return typeof v === 'number' ? v + bump : null;
  };

  const rows = useMemo(() => rules.routes
    .map((r) => ({ r, mins: ROUTE_KEYS.map((k) => minFor(r, k)) }))
    .filter(({ mins }) => mins.some((m) => m !== null)), [rules, column, bump]);

  const eligibleRows = rows.filter(({ mins }) => mins.some((m) => m !== null && score >= m));
  const shown = onlyEligible ? eligibleRows : rows;
  const showMedical = stream === 'scientific';

  const cell = (min: number | null) => {
    if (min === null) return <td class="routes-table__cell routes-table__cell--na" aria-label={t('routesNotOffered')}>—</td>;
    const ok = score >= min;
    return (
      <td class={`routes-table__cell ${ok ? 'routes-table__cell--ok' : 'routes-table__cell--no'}`}>
        <bdi>{formatAverage(min)}%</bdi>
        <span class="routes-table__mark" aria-hidden="true">{ok ? '✓' : '✕'}</span>
      </td>
    );
  };

  return (
    <div class="composite-box routes-box">
      <button
        type="button"
        class="composite-box__header"
        aria-expanded={open}
        aria-controls="routes-panel"
        onClick={() => setOpen(!open)}
      >
        <span class="composite-box__title">
          <span aria-hidden="true">{open ? '▼' : '▶'}</span> {t('routesTitle')}
        </span>
        <span class="composite-box__toggle-text">
          {fillTemplate(t('routesEligible'), { score: formatAverage(score), count: eligibleRows.length, total: rows.length })}
        </span>
      </button>

      {open && (
        <div id="routes-panel" class="fade-in composite-box__panel">
          <p class="routes-box__subtitle">{fillTemplate(t('routesSubtitle'), { year: yearLabel })}</p>

          <label class="filter-checkbox routes-box__toggle">
            <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible((e.target as HTMLInputElement).checked)} />
            <span>{t('routesShowOnlyEligible')}</span>
          </label>

          <div class="routes-table-wrap">
            <table class="routes-table">
              <thead>
                <tr>
                  <th scope="col">{t('routesField')}</th>
                  {ROUTE_KEYS.map((k) => <th scope="col" key={k}>{routeLabel[k]}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ r, mins }) => (
                  <tr key={r.id}>
                    <th scope="row"><bdi>{name(r)}</bdi></th>
                    {mins.map((m, i) => <Fragment key={ROUTE_KEYS[i]}>{cell(m)}</Fragment>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showMedical && (
            <>
              <h4 class="routes-box__heading">{t('routesMedicalTitle')}</h4>
              <div class="routes-table-wrap">
                <table class="routes-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('routesField')}</th>
                      <th scope="col">{t('routesMorning')}</th>
                      <th scope="col">{t('routesEvening')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.private_medical
                      .filter((m) => !onlyEligible || score >= m.morning || (m.evening !== null && score >= m.evening))
                      .map((m) => (
                        <tr key={m.id}>
                          <th scope="row"><bdi>{name(m)}</bdi></th>
                          {cell(m.morning)}
                          {cell(m.evening)}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p class="composite-note-banner"><Icon name="alert" size={14} class="inline-icon" /> {t('routesMedicalNote')}</p>
            </>
          )}

          <p class="composite-note-banner"><Icon name="info" size={14} class="inline-icon" /> {t('routesMartyrsNote')}</p>
          <p class="routes-box__source">
            <a href={rules.source_url} target="_blank" rel="noopener noreferrer">{t('officialSourceLink')}</a>
            {' · '}{rules.published}
          </p>
        </div>
      )}
    </div>
  );
}

// Preact's Fragment, imported lazily to keep the JSX above readable
import { Fragment } from 'preact';
