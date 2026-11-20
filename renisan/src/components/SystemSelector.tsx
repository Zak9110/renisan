import { useI18n } from '../hooks/useI18n';
import type { AdmissionSystem } from '../lib/types';

interface SystemSelectorProps {
  selected: AdmissionSystem;
  onSelect: (system: AdmissionSystem) => void;
}

export function SystemSelector({ selected, onSelect }: SystemSelectorProps) {
  const { t } = useI18n();

  return (
    <div class="system-selector" role="radiogroup" aria-label={t('systemSelectorLabel')}>
      <button
        type="button"
        class={`system-card ${selected === 'federal' ? 'system-card--active' : ''}`}
        role="radio"
        aria-checked={selected === 'federal'}
        onClick={() => onSelect('federal')}
      >
        <div class="system-card__header">
          <h2 class="system-card__title">{t('systemFederal')}</h2>
          <span class="system-card__badge">MOHESR</span>
        </div>
        <p class="system-card__desc">{t('systemFederalDesc')}</p>
      </button>

      <button
        type="button"
        class={`system-card ${selected === 'krg' ? 'system-card--active' : ''}`}
        role="radio"
        aria-checked={selected === 'krg'}
        onClick={() => onSelect('krg')}
      >
        <div class="system-card__header">
          <h2 class="system-card__title">{t('systemKRG')}</h2>
          <span class="system-card__badge">KRG Zankoline</span>
        </div>
        <p class="system-card__desc">{t('systemKRGDesc')}</p>
      </button>
    </div>
  );
}
