import { useState, useEffect, useMemo } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import { getWishlist, removeWishlistItem, clearWishlist, onWishlistChange, type WishlistItem } from '../lib/wishlist';

interface WishlistProps {
  onGoToChecker: () => void;
}

export function Wishlist({ onGoToChecker }: WishlistProps) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<WishlistItem[]>(getWishlist());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return onWishlistChange(() => {
      setItems(getWishlist());
    });
  }, []);

  const stats = useMemo(() => {
    const scores = items.filter(x => typeof x.score === 'number').map(x => x.score as number);
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
    return {
      total: items.length,
      avgScore,
      universities: items.filter(x => x.type !== 'scholarship').length,
      scholarships: items.filter(x => x.type === 'scholarship').length
    };
  }, [items]);

  const handleCopy = () => {
    if (items.length === 0) return;
    const textLines = [
      `⭐ ${t('wishlistTitle')} (${items.length})`,
      '----------------------------------------',
      ...items.map((item, idx) => {
        const scoreStr = item.score ? ` [${t('resultMinScore')}: ${item.score.toFixed(1)}%]` : '';
        const locStr = item.location ? ` - ${item.location}` : '';
        return `${idx + 1}. ${item.title} (${item.subtitle}${locStr})${scoreStr}`;
      }),
      '----------------------------------------',
      `${window.location.origin}${import.meta.env.BASE_URL}`
    ];
    const text = textLines.join('\n');
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
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

  return (
    <div class="wishlist-container">
      <div class="wishlist-hero">
        <div class="wishlist-hero__content">
          <h2 class="wishlist-hero__title">{t('wishlistTitle')}</h2>
          <p class="wishlist-hero__subtitle">{t('wishlistSubtitle')}</p>
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
              <span>{copied ? t('wishlistCopied') : t('copyWishlist')}</span>
            </button>

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

      {items.length === 0 ? (
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">⭐</span>
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
              <strong class="wishlist-stat-item__value">{stats.total}</strong>
            </div>
            {stats.avgScore && (
              <div class="wishlist-stat-item">
                <span class="wishlist-stat-item__label">{t('wishlistAverageScore')}</span>
                <strong class="wishlist-stat-item__value" style={{ color: 'var(--color-accent)' }}>
                  <bdi>{stats.avgScore}%</bdi>
                </strong>
              </div>
            )}
          </div>

          {/* Saved Items List */}
          <div class="results-list">
            {items.map((item, index) => (
              <div key={item.id} class="result-card wishlist-card">
                <div class="wishlist-card__badge-row">
                  <span class="wishlist-priority-badge">#{index + 1}</span>
                  <span class="tag tag--official">
                    {item.type === 'federal' ? t('systemFederal') : item.type === 'krg' ? t('systemKRG') : t('navScholarships')}
                  </span>
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
                      {item.subtitle} {item.location ? `• ${item.location}` : ''}
                    </span>
                    <h3 class="result-card__college">{item.title}</h3>
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
            ))}
          </div>
        </>
      )}
    </div>
  );
}
