import { useState, useEffect, useMemo } from 'preact/hooks';
import { Icon } from './Icon';
import { useI18n } from '../hooks/useI18n';
import {
  getWishlist,
  removeWishlistItem,
  clearWishlist,
  moveWishlistItem,
  moveWishlistItemTo,
  sortWishlistByCutoff,
  localizeWishlistItem,
  analyzeWishlistForm,
  checkForm,
  officialChoiceName,
  onWishlistChange,
  getPlans,
  setActivePlan,
  createPlan,
  renamePlan,
  deletePlan,
  updateWishlistItemMeta,
  MAX_PLANS,
  type ApplicationStage,
  type WishlistItem
} from '../lib/wishlist';
import { getProfile, onProfileChange } from '../lib/profile';
import { fillTemplate, formatDate, formatDelta } from '../lib/format';
import { chanceBand, type ChanceBand } from '../lib/chance';
import type { DatasetMeta, Scholarship } from '../lib/types';
import { downloadAllScholarshipsIcs } from '../lib/calendar';
import { getDeadlineBucket, getDaysUntilDeadline } from '../lib/matcher';

interface WishlistProps {
  onGoToChecker: () => void;
  studentScore?: number | null;
  meta?: DatasetMeta | null;
}

const BAND_LABEL: Record<ChanceBand, 'scoreDeltaSafe' | 'scoreDeltaTarget' | 'scoreDeltaReach'> = {
  safe: 'scoreDeltaSafe',
  target: 'scoreDeltaTarget',
  reach: 'scoreDeltaReach'
};

export function Wishlist({ onGoToChecker, studentScore, meta }: WishlistProps) {
  const { t, tf, lang } = useI18n();
  const [items, setItems] = useState<WishlistItem[]>(getWishlist());
  const [plans, setPlans] = useState(getPlans());
  const [profile, setProfile] = useState(getProfile());
  const [copied, setCopied] = useState<'list' | 'form' | null>(null);

  useEffect(() => {
    const offList = onWishlistChange(() => {
      setItems(getWishlist());
      setPlans(getPlans());
    });
    const offProfile = onProfileChange(() => setProfile(getProfile()));
    return () => {
      offList();
      offProfile();
    };
  }, []);

  const analysis = useMemo(() => analyzeWishlistForm(items, studentScore), [items, studentScore]);
  const formRules = meta?.federal.form ?? null;
  const formYear = formRules ? (lang === 'ar' && formRules.year_label_ar) || formRules.year_label : '';
  const form = useMemo(
    () => checkForm(items, { stream: profile.stream, subStream: profile.subStream, gender: profile.gender, channel: profile.channel }, formRules),
    [items, profile, formRules]
  );
  const hasFederal = items.some((x) => x.type === 'federal');
  const hasFormIssues = form.mixedSystems || form.wrongStream.length > 0 || form.wrongGender.length > 0 || form.wrongChannel.length > 0;

  const planName = (p: { id: string; name: string }, i: number) => p.name || fillTemplate(t('planDefaultName'), { n: i + 1 });

  const handleNewPlan = (copy: boolean) => {
    if (plans.plans.length >= MAX_PLANS) {
      window.alert(fillTemplate(t('planLimit'), { max: MAX_PLANS }));
      return;
    }
    const name = window.prompt(t('planNamePrompt'), '');
    if (name === null) return;
    createPlan(name, copy);
  };

  const handleRenamePlan = () => {
    const i = plans.plans.findIndex((p) => p.id === plans.active);
    const name = window.prompt(t('planNamePrompt'), plans.plans[i]?.name ?? '');
    if (name !== null) renamePlan(plans.active, name);
  };

  const handleDeletePlan = () => {
    const i = plans.plans.findIndex((p) => p.id === plans.active);
    if (window.confirm(fillTemplate(t('planDeleteConfirm'), { name: planName(plans.plans[i], i) }))) {
      deletePlan(plans.active);
    }
  };

  const handleMoveTo = (item: WishlistItem, index: number) => {
    const raw = window.prompt(`${t('wishlistMoveTo')} (1–${items.length})`, String(index + 1));
    if (raw === null) return;
    const n = parseInt(raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), 10);
    if (Number.isFinite(n)) moveWishlistItemTo(item.id, n);
  };

  const copyText = (text: string, kind: 'list' | 'form') => {
    const done = () => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2500);
    };
    // Clipboard API is missing on older Android WebViews / non-HTTPS — fall back to the share sheet
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        navigator.share?.({ text }).catch(() => {});
      });
    } else if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    }
  };

  const handleCopy = () => {
    if (items.length === 0) return;
    const textLines = [
      `⭐ ${t('wishlistTitle')} (${items.length})`,
      '----------------------------------------',
      ...items.map((item, idx) => {
        const loc = localizeWishlistItem(item, lang);
        const scoreStr = item.score != null ? ` [${t('resultMinScore')}: ${item.score.toFixed(1)}%]` : '';
        const locStr = loc.location ? ` - ${loc.location}` : '';
        return `${idx + 1}. ${loc.title} (${loc.subtitle}${locStr})${scoreStr}`;
      }),
      '----------------------------------------',
      `${window.location.origin}${import.meta.env.BASE_URL}`
    ];
    copyText(textLines.join('\n'), 'list');
  };

  /** One numbered block per form, with the names as the form shows them (Arabic for Qaddim, Sorani for Zankoline). */
  const handleCopyForForm = () => {
    const blocks: string[] = [];
    for (const type of ['federal', 'krg'] as const) {
      const list = items.filter((x) => x.type === type);
      if (list.length === 0) continue;
      blocks.push(
        [
          fillTemplate(t('formCopyHeader'), { system: t(type === 'federal' ? 'systemFederal' : 'systemKRG') }),
          ...list.map((item, i) => `${i + 1}. ${officialChoiceName(item)}`)
        ].join('\n')
      );
    }
    if (blocks.length > 0) copyText(blocks.join('\n\n'), 'form');
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleClear = () => {
    if (typeof window !== 'undefined' && window.confirm(t('clearWishlistConfirm'))) {
      clearWishlist();
    }
  };

  const datedScholarships = useMemo(
    () =>
      items
        .filter((x) => x.type === 'scholarship')
        .map((x) => ({ item: x, sch: x.raw as Scholarship }))
        .filter(({ sch }) => sch?.deadline && /^\d{4}-\d{2}-\d{2}$/.test(sch.deadline) && getDeadlineBucket(sch) !== 'closed'),
    [items]
  );

  const handleExportSavedDeadlines = () => {
    downloadAllScholarshipsIcs(
      datedScholarships.map(({ item, sch }) => ({
        scholarship: sch,
        localizedTitle: localizeWishlistItem(item, lang).title
      })),
      t('deadlineExpected')
    );
  };

  return (
    <div class="wishlist-container">
      <div class="wishlist-hero">
        <div class="wishlist-hero__content">
          <h2 class="wishlist-hero__title">{t('wishlistTitle')}</h2>
          <p class="wishlist-hero__subtitle">{t('wishlistSubtitle')}</p>
          {items.length > 1 && <p class="wishlist-hero__hint">{t('wishlistOrderHint')}</p>}
        </div>

        {items.length > 0 && (
          <div class="wishlist-actions">
            <button
              type="button"
              class="pill-btn pill-btn--active"
              onClick={handleCopy}
              aria-label={t('copyWishlist')}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              <span>{copied === 'list' ? t('wishlistCopied') : t('copyWishlist')}</span>
            </button>

            {analysis.universities > 0 && (
              <button type="button" class="pill-btn" onClick={handleCopyForForm} aria-label={t('copyForForm')}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                  <line x1="9" y1="16" x2="13" y2="16" />
                </svg>
                <span>{copied === 'form' ? t('wishlistCopied') : t('copyForForm')}</span>
              </button>
            )}

            {datedScholarships.length > 0 && (
              <button type="button" class="pill-btn" onClick={handleExportSavedDeadlines}>
                <Icon name="calendar" size={14} class="inline-icon" /> {t('deadlinesExportAll')} ({datedScholarships.length})
              </button>
            )}

            <button
              type="button"
              class="pill-btn"
              onClick={handlePrint}
              aria-label={t('printWishlist')}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>{t('printWishlist')}</span>
            </button>

            <button
              type="button"
              class="pill-btn pill-btn--danger"
              onClick={handleClear}
              aria-label={t('clearWishlist')}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              <span>{t('clearWishlist')}</span>
            </button>
          </div>
        )}
      </div>

      <div class="plan-bar" role="group" aria-label={t('planLabel')}>
        <label class="plan-bar__label" for="plan-select">{t('planLabel')}</label>
        <select
          id="plan-select"
          class="filter-select plan-bar__select"
          value={plans.active}
          onChange={(e) => setActivePlan((e.target as HTMLSelectElement).value)}
        >
          {plans.plans.map((p, i) => (
            <option key={p.id} value={p.id}>{`${planName(p, i)} (${p.count})`}</option>
          ))}
        </select>
        <div class="plan-bar__actions">
          <button type="button" class="pill-btn" onClick={() => handleNewPlan(false)}>＋ {t('planNew')}</button>
          {items.length > 0 && <button type="button" class="pill-btn" onClick={() => handleNewPlan(true)}>{t('planCopy')}</button>}
          <button type="button" class="pill-btn" onClick={handleRenamePlan}>{t('planRename')}</button>
          {plans.plans.length > 1 && (
            <button type="button" class="pill-btn pill-btn--danger" onClick={handleDeletePlan}>{t('planDelete')}</button>
          )}
        </div>
        <p class="plan-bar__hint">{t('planHint')}</p>
      </div>

      {items.length === 0 ? (
        <div class="empty-state">
          <span class="empty-state__icon"><Icon name="star" size={28} /></span>
          <h3 class="empty-state__title">{t('wishlistEmpty')}</h3>
          <p class="empty-state__hint">{t('wishlistEmptyHint')}</p>
          <button
            type="button"
            class="pill-btn pill-btn--active empty-state__action"
            onClick={onGoToChecker}
          >
            {t('navChecker')}
          </button>
        </div>
      ) : (
        <>
          {/* Stats Summary Bar */}
          <div class="wishlist-stats">
            <div class="wishlist-stat-item">
              <span class="wishlist-stat-item__label">{t('wishlistTotalItems')}</span>
              <strong class="wishlist-stat-item__value">{analysis.total}</strong>
            </div>
            <div class="wishlist-stat-item">
              <span class="wishlist-stat-item__label">
                {fillTemplate(t('wishlistBreakdown'), {
                  colleges: analysis.colleges,
                  institutes: analysis.institutes,
                  scholarships: analysis.scholarships
                })}
              </span>
            </div>
            {analysis.avgScore && (
              <div class="wishlist-stat-item">
                <span class="wishlist-stat-item__label">{t('wishlistAverageScore')}</span>
                <strong class="wishlist-stat-item__value" style={{ color: 'var(--color-accent)' }}>
                  <bdi>{analysis.avgScore}%</bdi>
                </strong>
              </div>
            )}
          </div>

          {/* Official form checks: choice count, technical minimum, and choices the form will reject */}
          {(hasFederal && formRules) || hasFormIssues ? (
            <div class="form-check" role="region" aria-label={t('formRulesSource')}>
              {hasFederal && formRules && (
                form.progress ? (
                  <div class="form-check__progress">
                    {form.progress.choices >= form.progress.requiredChoices && form.progress.technical >= form.progress.requiredTechnical ? (
                      <p class="wishlist-advisor__msg wishlist-advisor__msg--ok">{fillTemplate(t('formProgressDone'), { year: formYear })}</p>
                    ) : (
                      <p class="wishlist-advisor__msg">
                        📝 {fillTemplate(t('formProgress'), {
                          year: formYear,
                          choices: form.progress.choices,
                          required: form.progress.requiredChoices,
                          technical: form.progress.technical,
                          requiredTechnical: form.progress.requiredTechnical
                        })}
                      </p>
                    )}
                    <div class="form-check__bar" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, (form.progress.choices / form.progress.requiredChoices) * 100)}%` }} />
                    </div>
                  </div>
                ) : (
                  <p class="wishlist-advisor__msg">📝 {t('formNeedStream')}</p>
                )
              )}
              {form.mixedSystems && <p class="wishlist-advisor__msg wishlist-advisor__msg--warn"><Icon name="alert" size={14} class="inline-icon" /> {t('formMixedSystems')}</p>}
              {form.wrongStream.length > 0 && (
                <p class="wishlist-advisor__msg wishlist-advisor__msg--warn">⛔ {fillTemplate(t('formWrongStream'), { list: form.wrongStream.join(', #') })}</p>
              )}
              {form.wrongGender.length > 0 && (
                <p class="wishlist-advisor__msg wishlist-advisor__msg--warn">⛔ {fillTemplate(t('formWrongGender'), { list: form.wrongGender.join(', #') })}</p>
              )}
              {form.wrongChannel.length > 0 && (
                <p class="wishlist-advisor__msg wishlist-advisor__msg--warn"><Icon name="alert" size={14} class="inline-icon" /> {fillTemplate(t('formWrongChannel'), { list: form.wrongChannel.join(', #') })}</p>
              )}
              {hasFederal && formRules && (
                <a class="form-check__source" href={formRules.source_url} target="_blank" rel="noopener noreferrer">
                  {t('formRulesSource')} · {formYear}
                </a>
              )}
            </div>
          ) : null}

          {/* Smart Official Preference Form Advisor */}
          {analysis.universities >= 2 && (
            <div class="wishlist-advisor" role="region" aria-label={t('wishlistAdvisorTitle')}>
              <div class="wishlist-advisor__header">
                <strong>🧭 {t('wishlistAdvisorTitle')}</strong>
                {analysis.inversions.length > 0 && (
                  <button
                    type="button"
                    class="pill-btn pill-btn--active"
                    onClick={sortWishlistByCutoff}
                  >
                    ↕ {t('wishlistAutoSort')}
                  </button>
                )}
              </div>

              {analysis.inversions.length > 0 ? (
                <p class="wishlist-advisor__msg wishlist-advisor__msg--warn">
                  <Icon name="alert" size={14} class="inline-icon" />{' '}
                  {fillTemplate(t('wishlistInversionWarning'), {
                    first: analysis.inversions[0].higherPriorityIndex + 1,
                    firstScore: (analysis.inversions[0].higherPriorityItem.score ?? 0).toFixed(1),
                    second: analysis.inversions[0].lowerPriorityIndex + 1,
                    secondScore: (analysis.inversions[0].lowerPriorityItem.score ?? 0).toFixed(1)
                  })}
                </p>
              ) : (
                <p class="wishlist-advisor__msg wishlist-advisor__msg--ok">
                  {t('wishlistOrderOptimal')}
                </p>
              )}

              {analysis.needsSafetyNet && (
                <p class="wishlist-advisor__msg wishlist-advisor__msg--warn">
                  <Icon name="shield" size={14} class="inline-icon" /> {t('wishlistSafetyWarning')}
                </p>
              )}
            </div>
          )}

          {/* Saved Items List */}
          <div class="results-list">
            {items.map((item, index) => {
              const loc = localizeWishlistItem(item, lang);
              const isUni = item.type !== 'scholarship';
              const scoreDiff = isUni && studentScore != null && item.score != null
                ? Number((studentScore - item.score).toFixed(2))
                : null;
              const band = scoreDiff != null ? chanceBand(scoreDiff) : null;

              return (
                <div key={item.id} class={`result-card wishlist-card ${band ? `result-card--${band}` : ''}`}>
                  <div class="wishlist-card__badge-row">
                    {items.length > 2 ? (
                      <button
                        type="button"
                        class="wishlist-priority-badge wishlist-priority-badge--btn"
                        onClick={() => handleMoveTo(item, index)}
                        aria-label={`${t('wishlistMoveTo')} #${index + 1}`}
                        title={t('wishlistMoveTo')}
                      >
                        #{index + 1}
                      </button>
                    ) : (
                      <span class="wishlist-priority-badge">#{index + 1}</span>
                    )}
                    <span class="wishlist-order-btns">
                      <button
                        type="button"
                        class="wishlist-order-btn"
                        onClick={() => moveWishlistItem(item.id, -1)}
                        disabled={index === 0}
                        aria-label={t('wishlistMoveUp')}
                        title={t('wishlistMoveUp')}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        class="wishlist-order-btn"
                        onClick={() => moveWishlistItem(item.id, 1)}
                        disabled={index === items.length - 1}
                        aria-label={t('wishlistMoveDown')}
                        title={t('wishlistMoveDown')}
                      >
                        ▼
                      </button>
                    </span>
                    <span class="tag tag--official">
                      {item.type === 'federal' ? t('systemFederal') : item.type === 'krg' ? t('systemKRG') : t('navScholarships')}
                    </span>
                    {loc.isInstitute && (
                      <span class="tag tag--institute">{t('levelInstitute')}</span>
                    )}
                    {band && scoreDiff != null && (
                      <span class={`delta-badge delta-badge--${band}`}>
                        <span class="delta-badge__dot" aria-hidden="true" />
                        <bdi dir="ltr">{formatDelta(scoreDiff)}</bdi>
                        <span>{t(BAND_LABEL[band])}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      class="wishlist-remove-btn"
                      onClick={() => removeWishlistItem(item.id)}
                      aria-label={t('removeFromWishlist')}
                      title={t('removeFromWishlist')}
                    >
                      ✕
                    </button>
                  </div>

                  <div class="result-card__top">
                    <div class="result-card__institution">
                      <span class="result-card__uni">
                        {loc.subtitle} {loc.location && item.type !== 'scholarship' ? `• ${loc.location}` : ''}
                      </span>
                      <h3 class="result-card__college">{loc.title}</h3>
                    </div>

                    {item.score != null && (
                      <div class="result-card__score-badge">
                        <span class="result-card__score-label">{t('resultMinScore')}</span>
                        <span class="result-card__score-val">
                          <bdi>{item.score.toFixed(1)}%</bdi>
                        </span>
                      </div>
                    )}
                  </div>

                  {item.type === 'scholarship' && (
                    <div class="wishlist-sch-tracker">
                      {(() => {
                        const sch = item.raw as Scholarship;
                        const hasDate = !!sch?.deadline && /^\d{4}-\d{2}-\d{2}$/.test(sch.deadline);
                        const days = hasDate ? getDaysUntilDeadline(sch) : null;
                        const bucket = sch ? getDeadlineBucket(sch) : 'tba';
                        return (
                          <div class="wishlist-sch-tracker__row">
                            {hasDate && (
                              <span class={`deadline-countdown deadline-countdown--${bucket}`}>
                                <Icon name="calendar" size={12} class="inline-icon" /> <bdi>{formatDate(sch.deadline!, lang)}</bdi>
                                {days != null && !sch.deadline_estimated ? ` · ${tf('daysRemaining', { days })}` : sch.deadline_estimated ? ` (${t('deadlineExpected')})` : ''}
                              </span>
                            )}
                            <select
                              class="filter-select wishlist-stage-select"
                              value={item.stage ?? 'saved'}
                              aria-label={t('stageLabel')}
                              onChange={(e) =>
                                updateWishlistItemMeta(item.id, {
                                  stage: (e.target as HTMLSelectElement).value as ApplicationStage
                                })
                              }
                            >
                              <option value="saved">{t('stageSaved')}</option>
                              <option value="preparing">{t('stagePreparing')}</option>
                              <option value="applied">{t('stageApplied')}</option>
                              <option value="got_it">{t('stageGotIt')}</option>
                              <option value="rejected">{t('stageRejected')}</option>
                            </select>
                            <input
                              type="text"
                              class="filter-select wishlist-note-input"
                              placeholder={t('itemNotePlaceholder')}
                              value={item.note ?? ''}
                              onInput={(e) =>
                                updateWishlistItemMeta(item.id, { note: (e.target as HTMLInputElement).value })
                              }
                            />
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {item.url && (
                    <div class="scholarship-card__footer" style={{ borderTop: 'none', paddingTop: '0' }}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="apply-btn"
                      >
                        <span>{t('scholarshipApply')}</span>
                        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
