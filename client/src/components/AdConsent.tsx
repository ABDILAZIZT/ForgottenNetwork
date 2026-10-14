import { useEffect, useState } from 'react';
import { ADS_ENABLED, readAdConsent, saveAdConsent, type AdConsentChoice } from '../ads';

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
  return (
    <div className="fn-ad-consent-actions">
      <button type="button" onClick={() => onChoice('accepted')}>
        Allow optional ads
      </button>
      <button type="button" onClick={() => onChoice('rejected')}>
        Decline optional ads
      </button>
    </div>
  );
}

export function AdConsentNotice() {
  const [choice, setChoice] = useAdChoice();
  if (!ADS_ENABLED || choice !== 'unset') return null;
  const choose = (next: 'accepted' | 'rejected') => {
    if (saveAdConsent(next)) setChoice(next);
  };
  return (
    <aside className="fn-ad-consent-notice" aria-label="Optional advertising choices">
      <p>
        Optional ads may use cookies or similar device storage. Ads stay off until you allow them
        and the site has a Google-certified consent tool configured. The canvas works either way.
      </p>
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
