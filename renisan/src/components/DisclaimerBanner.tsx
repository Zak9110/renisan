import { useState } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import type { DatasetMeta } from '../lib/types';
import { fillTemplate } from '../lib/format';

const STORAGE_KEY = 'renisan_disclaimer_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The "previous-year data" warning. Returning visitors can shrink it to one line to
 * save screen space on phones, but it never disappears — students must always know
 * the cutoffs are last year's.
 */
export function DisclaimerBanner({ meta }: { meta: DatasetMeta | null }) {
  const { t, lang } = useI18n();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const year = meta ? (lang === 'ar' && meta.federal.year_label_ar) || meta.federal.year_label : '…';

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Non-fatal: the banner just reopens next visit
    }
  };

  return (
    <div class={`disclaimer ${collapsed ? 'disclaimer--collapsed' : ''}`} role="note">
      <span class="disclaimer__icon" aria-hidden="true">⚠️</span>
      <p class="disclaimer__text">{fillTemplate(collapsed ? t('disclaimerShort') : t('disclaimerText'), { year })}</p>
      <button
        type="button"
        class="disclaimer__toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t('showMore') : t('showLess')}
        title={collapsed ? t('showMore') : t('showLess')}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          {collapsed ? <polyline points="6 9 12 15 18 9" /> : <polyline points="18 15 12 9 6 15" />}
        </svg>
      </button>
    </div>
  );
}
