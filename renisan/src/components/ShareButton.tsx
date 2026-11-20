import { useState } from 'preact/hooks';
import { useI18n } from '../hooks/useI18n';

interface ShareButtonProps {
  resultsCount?: number;
}

export function ShareButton({ resultsCount }: ShareButtonProps) {
  const { t, tf, lang } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    // Shared links open in the sender's language (the recipient can still switch)
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('lang', lang);
    const url = shareUrl.toString();
    const shareData = {
      title: t('shareTitle'),
      text: `${t('appName')} — ${tf('resultsCount', { count: String(resultsCount ?? 0) })}`,
      url: url
    };

    if (navigator.share && typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        // User dismissed the share sheet — don't also copy to clipboard
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.warn('Clipboard write failed', e);
    }
  };

  return (
    <button
      type="button"
      class="share-btn"
      onClick={handleShare}
      title={copied ? t('shareCopied') : t('shareButton')}
      aria-live="polite"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
      </svg>
      <span>{copied ? t('shareCopied') : t('shareButton')}</span>
    </button>
  );
}
