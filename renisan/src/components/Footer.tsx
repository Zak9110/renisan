import { useI18n } from '../hooks/useI18n';
import type { DatasetMeta } from '../lib/types';
import { fillTemplate } from '../lib/format';

// Set VITE_CONTACT_URL at build time (a mailto:, form, or social link) to show a feedback link.
const CONTACT_URL: string | undefined = import.meta.env.VITE_CONTACT_URL || undefined;

interface FooterProps {
  meta: DatasetMeta | null;
}

export function Footer({ meta }: FooterProps) {
  const { t, lang } = useI18n();
  const year = meta ? (lang === 'ar' && meta.federal.year_label_ar) || meta.federal.year_label : '…';
  const krgYear = meta ? (lang === 'ar' && meta.krg.year_label_ar) || meta.krg.year_label : '…';

  return (
    <footer class="footer" role="contentinfo">
      <p class="footer__text">{t('footerDisclaimer')}</p>
      <p class="footer__text">{fillTemplate(t('footerDataSource'), { year, krgYear })}</p>
      {meta && (
        <p class="footer__text">
          <a class="footer__link" href={meta.federal.source_url} target="_blank" rel="noopener noreferrer">
            {t('officialSourceLink')} — MOHESR
          </a>
          {' · '}
          <a class="footer__link" href={meta.krg.source_url} target="_blank" rel="noopener noreferrer">
            {t('officialSourceLink')} — Zankoline
          </a>
        </p>
      )}
      {CONTACT_URL && (
        <p class="footer__text">
          <a class="footer__link" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
            {t('reportDataError')}
          </a>
        </p>
      )}
      <p class="footer__credits">{t('footerBuiltBy')}</p>
    </footer>
  );
}
