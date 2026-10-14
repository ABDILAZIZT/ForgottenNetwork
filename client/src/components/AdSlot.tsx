import { useEffect, useRef, useState } from 'react';
import {
  AD_SLOT_UNITS,
  ADS_ENABLED,
  canRequestDisplayAds,
  hasValidPublisherId,
  loadAdsense,
} from '../ads';

export default function AdSlot({
  slotId,
  size = 'rectangle',
  position,
}: {
  slotId: string;
  size?: 'banner' | 'rectangle' | 'leaderboard';
  position: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const unitId = AD_SLOT_UNITS[slotId] || '';

  useEffect(() => {
    if (!ADS_ENABLED || !unitId || !hasValidPublisherId()) return;
    let disposed = false;
    const refresh = () => {
      void canRequestDisplayAds().then((allowed) => {
        if (!allowed || disposed) return;
        void loadAdsense().then((loaded) => {
          if (loaded && !disposed) setActive(true);
        });
      });
    };
    refresh();
    window.addEventListener('fn-ad-consent-change', refresh);
    return () => {
      disposed = true;
      window.removeEventListener('fn-ad-consent-change', refresh);
    };
  }, [unitId]);

  useEffect(() => {
    if (!active || !window.adsbygoogle || !ref.current) return;
    if (ref.current.dataset.requested === 'true') return;
    ref.current.dataset.requested = 'true';
    try {
      window.adsbygoogle.push({});
    } catch {
      ref.current.dataset.requested = 'false';
    }
  }, [active]);

  if (!ADS_ENABLED) {
    if (!import.meta.env.DEV) return null;
    return (
      <aside
        className={`fn-ad-slot ${size}`}
        aria-label="Advertisement placement preview"
        data-ad-slot={slotId}
        data-position={position}
      >
        <small>ADVERTISEMENT · PREVIEW ONLY</small>
        <div>
          <strong>Ad placement preview</strong>
          <span>
            {size === 'rectangle' ? '300 × 250' : size === 'leaderboard' ? '728 × 90' : '320 × 50'}
          </span>
        </div>
      </aside>
    );
  }

  if (!active || !unitId) return null;
  return (
    <aside
      className={`fn-ad-slot ${size}`}
      aria-label="Advertisement"
      data-ad-slot={slotId}
      data-position={position}
    >
      <small>ADVERTISEMENT</small>
      <div ref={ref}>
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={import.meta.env.VITE_ADSENSE_CLIENT_ID}
          data-ad-slot={unitId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
}
