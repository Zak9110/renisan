import { useState, useEffect, useCallback } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';
import { Header } from './Header';
import { EligibilityChecker } from './EligibilityChecker';
import { ScholarshipDirectory } from './ScholarshipDirectory';
import { DisclaimerBanner } from './DisclaimerBanner';
import { Footer } from './Footer';
import type { ComponentChildren } from 'preact';
import type { FederalCutoff, KRGCutoff, Scholarship } from '../lib/types';
import { loadFederalCutoffs, loadKRGCutoffs, loadScholarships, clearDataCache } from '../lib/data-loader';

type Tab = 'checker' | 'scholarships';

export function App() {
  const { t, isLoaded } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('checker');
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
      loadFederalCutoffs(),
      loadKRGCutoffs(),
      loadScholarships()
    ]).then(([fed, krg, sch]) => {
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
          <span class="empty-state__icon" aria-hidden="true">⚠️</span>
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
      <div class="app-loading" role="status" aria-label="Loading">
        <div class="loading-spinner" />
      </div>
    );
  }

  return (
    <div class="app-container">
      <Header isOfflineReady={isOfflineReady} />
      <DisclaimerBanner />

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
      </nav>

      <main>
        {activeTab === 'checker' && (
          <div id="panel-checker" role="tabpanel" aria-labelledby="tab-checker" class="fade-in">
            {renderPanel(<EligibilityChecker federalData={federalData} krgData={krgData} />)}
          </div>
        )}
        {activeTab === 'scholarships' && (
          <div id="panel-scholarships" role="tabpanel" aria-labelledby="tab-scholarships" class="fade-in">
            {renderPanel(<ScholarshipDirectory scholarships={scholarships} />)}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
