import { useI18n } from '../hooks/useI18n';

export function DisclaimerBanner() {
  const { t } = useI18n();

  return (
    <div class="disclaimer" role="note">
      <span class="disclaimer__icon" aria-hidden="true">⚠️</span>
      <p class="disclaimer__text">{t('disclaimerText')}</p>
    </div>
  );
}
