import { useI18n } from '../hooks/useI18n';
import type { DatasetMeta } from '../lib/types';
import { fillTemplate, formatDate } from '../lib/format';
import { BrandMark } from './BrandMark';

// Set VITE_CONTACT_URL at build time (a mailto:, form, or social link) to show a feedback link.
const CONTACT_URL: string | undefined = import.meta.env.VITE_CONTACT_URL || undefined;

type Tab = 'checker' | 'scholarships' | 'wishlist';

interface FooterProps {
  meta: DatasetMeta | null;
  onNavigate: (tab: Tab) => void;
}

export function Footer({ meta, onNavigate }: FooterProps) {
  const { t, lang } = useI18n();
  const year = meta ? (lang === 'ar' && meta.federal.year_label_ar) || meta.federal.year_label : '…';
  const krgYear = meta ? (lang === 'ar' && meta.krg.year_label_ar) || meta.krg.year_label : '…';

  const go = (tab: Tab) => {
    onNavigate(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer class="footer" role="contentinfo">
      <div class="footer__grid">
        <div class="footer__brand">
          <div class="footer__lockup">
            <BrandMark size={28} />
            <span class="footer__name">{t('appName')}</span>
          </div>
          <p class="footer__mission">{t('footerBuiltBy')}</p>
        </div>

        <nav class="footer__col" aria-label={t('footerExplore')}>
          <h2 class="footer__heading">{t('footerExplore')}</h2>
          <ul class="footer__list">
            <li><button type="button" class="footer__link" onClick={() => go('checker')}>{t('navChecker')}</button></li>
            <li><button type="button" class="footer__link" onClick={() => go('scholarships')}>{t('navScholarships')}</button></li>
            <li><button type="button" class="footer__link" onClick={() => go('wishlist')}>{t('navWishlist')}</button></li>
          </ul>
        </nav>

        <div class="footer__col">
          <h2 class="footer__heading">{t('footerSources')}</h2>
          <ul class="footer__list">
            {meta && (
              <>
                <li>
                  <a class="footer__link" href={meta.federal.source_url} target="_blank" rel="noopener noreferrer">
                    MOHESR <span class="footer__meta">{year}</span>
                  </a>
                </li>
                <li>
                  <a class="footer__link" href={meta.krg.source_url} target="_blank" rel="noopener noreferrer">
                    Zankoline <span class="footer__meta">{krgYear}</span>
                  </a>
                </li>
              </>
            )}
            {CONTACT_URL && (
              <li>
                <a class="footer__link" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
                  {t('reportDataError')}
                </a>
              </li>
            )}
          </ul>
          {meta?.updated && (
            <p class="footer__meta">{fillTemplate(t('footerUpdated'), { date: formatDate(meta.updated, lang) })}</p>
          )}
        </div>
      </div>

      <div class="footer__bottom">
        <p class="footer__fine">{t('footerDisclaimer')} {t('footerIndependent')}</p>
        <p class="footer__fine">{fillTemplate(t('footerDataSource'), { year, krgYear })}</p>
        <p class="footer__copy">© {new Date().getFullYear()} {t('appName')}</p>
      </div>
    </footer>
  );
}
