import { useEffect, useState } from 'react';
import { ADS_ENABLED, readAdConsent, saveAdConsent, type AdConsentChoice } from '../ads';
import { translate, useLocale } from '../locale';

function useAdChoice() {
  const [choice, setChoice] = useState<AdConsentChoice>(readAdConsent);
  useEffect(() => {
    const refresh = () => setChoice(readAdConsent());
    window.addEventListener('fn-ad-consent-change', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('fn-ad-consent-change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return [choice, setChoice] as const;
}

function ChoiceButtons({ onChoice }: { onChoice: (choice: 'accepted' | 'rejected') => void }) {
  const locale = useLocale();
  return (
    <div className="fn-ad-consent-actions" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <button type="button" onClick={() => onChoice('accepted')}>
        {translate('ads.allow', locale)}
      </button>
      <button type="button" onClick={() => onChoice('rejected')}>
        {translate('ads.decline', locale)}
      </button>
    </div>
  );
}

export function AdConsentNotice() {
  const locale = useLocale();
  const [choice, setChoice] = useAdChoice();
  if (!ADS_ENABLED || choice !== 'unset') return null;
  const choose = (next: 'accepted' | 'rejected') => {
    if (saveAdConsent(next)) setChoice(next);
  };
  return (
    <aside
      className="fn-ad-consent-notice"
      aria-label={translate('ads.label', locale)}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <p>{translate('ads.body', locale)}</p>
      <ChoiceButtons onChoice={choose} />
    </aside>
  );
}

export function AdConsentSettings() {
  const [choice, setChoice] = useAdChoice();
  const choose = (next: 'accepted' | 'rejected') => {
    if (saveAdConsent(next)) setChoice(next);
  };
  return (
    <section className="fn-ad-consent-settings" aria-labelledby="ad-consent-heading">
      <h2 id="ad-consent-heading">Optional advertising choices</h2>
      <p>
        Current choice: {choice === 'unset' ? 'not set' : choice}. Ads are currently{' '}
        {ADS_ENABLED
          ? 'configured for this deployment only if valid publisher IDs and consent are available.'
          : 'disabled by the site operator.'}
      </p>
      <p>
        Your choice is saved on this device. In regions where Google requires a certified IAB TCF
        consent management platform, that platform must also report consent before any ad script
        loads. Without it, the app keeps ads disabled.
      </p>
      <ChoiceButtons onChoice={choose} />
    </section>
  );
}
