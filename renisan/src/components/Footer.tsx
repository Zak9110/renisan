import { useI18n } from '../hooks/useI18n';

export function Footer() {
  const { t } = useI18n();

  return (
    <footer class="footer" role="contentinfo">
      <p class="footer__text">{t('footerDisclaimer')}</p>
      <p class="footer__text">{t('footerDataSource')}</p>
      <p class="footer__credits">{t('footerBuiltBy')}</p>
    </footer>
  );
}
