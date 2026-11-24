import { useState, useEffect, useCallback } from 'preact/hooks';
import { Icon } from './Icon';
import { useI18n } from '../hooks/useI18n';
import { Header } from './Header';
import { EligibilityChecker } from './EligibilityChecker';
import { ScholarshipDirectory } from './ScholarshipDirectory';
import { Wishlist } from './Wishlist';
import { DisclaimerBanner } from './DisclaimerBanner';
import { Footer } from './Footer';
import { Hero } from './Hero';
import type { ComponentChildren } from 'preact';
import type { FederalCutoff, KRGCutoff, Scholarship, DatasetMeta } from '../lib/types';
import { loadMeta, loadFederalCutoffs, loadKRGCutoffs, loadScholarships, clearDataCache } from '../lib/data-loader';
import { getWishlist, onWishlistChange } from '../lib/wishlist';
import { getProfile } from '../lib/profile';
import { normalizeDigits } from '../lib/normalizer';

type Tab = 'checker' | 'scholarships' | 'wishlist';

export function App() {
  const { t, lang, config, isLoaded } = useI18n();
  const [activeTab, setActiveTabState] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'checker';
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam === 'scholarships' || tabParam === 'wishlist') return tabParam;
    return 'checker';
  });

  const [wishlistCount, setWishlistCount] = useState<number>(() => getWishlist().length);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [studentScore, setStudentScore] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    // A shared link wins; otherwise fall back to the score saved on this device
    const raw = new URLSearchParams(window.location.search).get('score') ?? getProfile().score ?? null;
    const n = raw ? parseFloat(normalizeDigits(raw)) : NaN;
    return Number.isFinite(n) && n >= 0 && n <= 110 ? n : null;
  });

  // Keep the tab title and meta description in the reader's language (helps sharing, bookmarks, screen readers)
  useEffect(() => {
    if (!isLoaded) return;
    document.title = `${t('appName')} | ${t('appTagline')}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('appTagline'));
  }, [lang, isLoaded, t]);

  useEffect(() => {
    return onWishlistChange(() => {
      setWishlistCount(getWishlist().length);
    });
  }, []);

  // Listen to window scroll to show/hide "Back to Top" button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Reflect the tab in the URL so links can point straight at any tab
  const setActiveTab = (tab: Tab) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === 'checker') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  };

  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [federalData, setFederalData] = useState<FederalCutoff[]>([]);
  const [krgData, setKrgData] = useState<KRGCutoff[]>([]);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isOfflineReady, setIsOfflineReady] = useState(false);

  const loadData = useCallback(() => {
    setDataLoaded(false);
    setLoadError(false);
    Promise.all([
      loadMeta(),
      loadFederalCutoffs(),
      loadKRGCutoffs(),
      loadScholarships()
    ]).then(([m, fed, krg, sch]) => {
      setMeta(m);
      setFederalData(fed);
      setKrgData(krg);
      setScholarships(sch);
    }).catch(err => {
      console.error('[Renisan] Failed to load data:', err);
      clearDataCache();
      setLoadError(true);
    }).finally(() => {
      setDataLoaded(true);
    });
  }, []);

  useEffect(() => {
    loadData();

    if ('serviceWorker' in navigator) {
      setIsOfflineReady(navigator.serviceWorker.controller !== null);
      // First visit: the SW takes control after install — update the badge then
      const onControllerChange = () => setIsOfflineReady(true);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    }
  }, [loadData]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderPanel = (content: ComponentChildren) => {
    if (!dataLoaded) {
      return (
        <div class="app-loading" role="status">
          <div class="loading-spinner" />
          <p class="app-loading__text">{t('loading')}</p>
        </div>
      );
    }
    if (loadError) {
      return (
        <div class="empty-state" role="alert">
          <span class="empty-state__icon"><Icon name="alert" size={28} /></span>
          <h3 class="empty-state__title">{t('error')}</h3>
          <button type="button" class="pill-btn empty-state__action" onClick={loadData}>
            {t('retry')}
          </button>
        </div>
      );
    }
    return content;
  };

  if (!isLoaded) {
    return (
      <div class="app-loading" role="status" aria-label={config.loadingLabel}>
        <div class="loading-spinner" />
      </div>
    );
  }

  return (
    <div class="app-container">
      <Header isOfflineReady={isOfflineReady} />

      <nav class="tab-nav" role="tablist">
        <button
          id="tab-checker"
          class={`tab-nav__btn ${activeTab === 'checker' ? 'tab-nav__btn--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'checker'}
          aria-controls="panel-checker"
          onClick={() => setActiveTab('checker')}
        >
          <svg aria-hidden="true" class="tab-nav__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span>{t('navChecker')}</span>
        </button>
        <button
          id="tab-scholarships"
          class={`tab-nav__btn ${activeTab === 'scholarships' ? 'tab-nav__btn--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'scholarships'}
          aria-controls="panel-scholarships"
          onClick={() => setActiveTab('scholarships')}
        >
          <svg aria-hidden="true" class="tab-nav__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 14l9-5-9-5-9 5 9 5z" />
            <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
          <span>{t('navScholarships')}</span>
        </button>
        <button
          id="tab-wishlist"
          class={`tab-nav__btn ${activeTab === 'wishlist' ? 'tab-nav__btn--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'wishlist'}
          aria-controls="panel-wishlist"
          onClick={() => setActiveTab('wishlist')}
        >
          <svg aria-hidden="true" class="tab-nav__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>{t('navWishlist')}</span>
          {wishlistCount > 0 && (
            <span class="tab-nav__badge">{wishlistCount}</span>
          )}
        </button>
      </nav>

      <DisclaimerBanner meta={meta} />

      <main>
        {activeTab === 'checker' && (
          <div id="panel-checker" role="tabpanel" aria-labelledby="tab-checker" class="fade-in">
            {dataLoaded && !loadError && (
              <Hero meta={meta} cutoffCount={federalData.length + krgData.length} scholarshipCount={scholarships.length} />
            )}
            {renderPanel(
              <EligibilityChecker
                federalData={federalData}
                krgData={krgData}
                scholarships={scholarships}
                meta={meta}
                onScoreChange={setStudentScore}
                onOpenScholarshipsWithScore={(gpa) => {
                  setStudentScore(gpa);
                  setActiveTab('scholarships');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
          </div>
        )}
        {activeTab === 'scholarships' && (
          <div id="panel-scholarships" role="tabpanel" aria-labelledby="tab-scholarships" class="fade-in">
            {renderPanel(<ScholarshipDirectory scholarships={scholarships} initialStudentScore={studentScore} />)}
          </div>
        )}
        {activeTab === 'wishlist' && (
          <div id="panel-wishlist" role="tabpanel" aria-labelledby="tab-wishlist" class="fade-in">
            {renderPanel(<Wishlist onGoToChecker={() => setActiveTab('checker')} studentScore={studentScore} meta={meta} />)}
          </div>
        )}
      </main>

      <Footer meta={meta} onNavigate={setActiveTab} />

      {/* Floating Back to Top button */}
      {showScrollTop && (
        <button
          type="button"
          class="back-to-top-btn fade-in"
          onClick={scrollToTop}
          aria-label={t('backToTop')}
          title={t('backToTop')}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </div>
  );
}
