export type AdConsentChoice = 'accepted' | 'rejected' | 'unset';
export type RewardedAdResult = 'granted' | 'closed' | 'unavailable';

const CONSENT_KEY = 'fn_ad_consent_v1';
const GOOGLE_TCF_VENDOR_ID = '755';
const CONSENT_PURPOSE = '1';
const ADSENSE_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID || '';
const REWARDED_UNIT = import.meta.env.VITE_AD_MANAGER_REWARDED_UNIT || '';

export const ADS_ENABLED = import.meta.env.PROD && import.meta.env.VITE_ADS_ENABLED === 'true';

export const AD_SLOT_UNITS: Record<string, string> = {
  'ad-slot-top-banner': import.meta.env.VITE_AD_SLOT_TOP_BANNER || '',
  'ad-slot-sidebar': import.meta.env.VITE_AD_SLOT_SIDEBAR || '',
  'ad-slot-marketplace-feed': import.meta.env.VITE_AD_SLOT_MARKETPLACE_FEED || '',
  'ad-slot-footer': import.meta.env.VITE_AD_SLOT_FOOTER || '',
  'ad-slot-loading': import.meta.env.VITE_AD_SLOT_LOADING || '',
};

type TcfData = {
  eventStatus?: string;
  gdprApplies?: boolean;
  purpose?: { consents?: Record<string, boolean> };
  vendor?: { consents?: Record<string, boolean> };
};
type TcfApi = (
  command: 'addEventListener',
  version: 2,
  callback: (data: TcfData, success: boolean) => void,
) => void;
type GptSlot = { addService: (service: unknown) => GptSlot };
type GptEvent = { slot: GptSlot; makeRewardedVisible?: () => boolean };
type GptPubAds = {
  addEventListener: (name: string, callback: (event: GptEvent) => void) => void;
};
type GoogleTag = {
  apiReady?: boolean;
  cmd: Array<() => void>;
  enums: { OutOfPageFormat: { REWARDED: unknown } };
  defineOutOfPageSlot: (path: string, format: unknown) => GptSlot | null;
  pubads: () => GptPubAds;
  enableServices: () => void;
  display: (slot: GptSlot) => void;
  destroySlots: (slots: GptSlot[]) => void;
};

declare global {
  interface Window {
    __tcfapi?: TcfApi;
    adsbygoogle?: unknown[];
    googletag?: GoogleTag;
  }
}

export function readAdConsent(): AdConsentChoice {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'accepted' || value === 'rejected' ? value : 'unset';
  } catch {
    return 'unset';
  }
}

export function saveAdConsent(choice: Exclude<AdConsentChoice, 'unset'>): boolean {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    return false;
  }
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('fn-ad-consent-change'));
  } catch {
    // A missing DOM event target does not undo the preference saved above.
  }
  return true;
}

export function hasValidPublisherId() {
  return /^ca-pub-\d{16}$/.test(ADSENSE_CLIENT_ID);
}

export function rewardedAdsConfigured() {
  return ADS_ENABLED && REWARDED_UNIT.startsWith('/');
}

function tcfConsentAllowsAds(timeoutMs = 5000): Promise<boolean> {
  if (typeof window.__tcfapi !== 'function') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (allowed: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(allowed);
    };
    const timeout = window.setTimeout(() => finish(false), timeoutMs);

    try {
      window.__tcfapi?.('addEventListener', 2, (data, success) => {
        if (!success || !data) return;
        if (data.eventStatus !== 'tcloaded' && data.eventStatus !== 'useractioncomplete') return;
        if (data.gdprApplies === false) return finish(true);
        finish(
          Boolean(
            data.purpose?.consents?.[CONSENT_PURPOSE] &&
            data.vendor?.consents?.[GOOGLE_TCF_VENDOR_ID],
          ),
        );
      });
    } catch {
      finish(false);
    }
  });
}

export async function canRequestDisplayAds(): Promise<boolean> {
  if (!ADS_ENABLED || !hasValidPublisherId() || readAdConsent() !== 'accepted') return false;
  return tcfConsentAllowsAds();
}

async function loadScript(id: string, src: string): Promise<boolean> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === 'true') return true;
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
    });
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.id = id;
    script.async = true;
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve(true);
      },
      { once: true },
    );
    script.addEventListener('error', () => {
      script.remove();
      resolve(false);
    });
    document.head.append(script);
  });
}

let adsensePromise: Promise<boolean> | null = null;
export async function loadAdsense(): Promise<boolean> {
  if (!(await canRequestDisplayAds())) return false;
  adsensePromise ??= loadScript(
    'fn-google-adsense',
    `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`,
  );
  const loaded = await adsensePromise;
  if (!loaded) adsensePromise = null;
  return loaded;
}

let gptPromise: Promise<boolean> | null = null;
let activeReward:
  { slot: GptSlot; finish: (result: RewardedAdResult) => void; granted: boolean } | undefined;
let rewardedListenersReady = false;
let gptServicesEnabled = false;

async function loadGooglePublisherTag(): Promise<boolean> {
  if (window.googletag?.apiReady) return true;
  window.googletag ??= {
    cmd: [],
    enums: { OutOfPageFormat: { REWARDED: 'rewarded' } },
  } as unknown as GoogleTag;
  gptPromise ??= loadScript(
    'fn-google-publisher-tag',
    'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
  );
  const loaded = await gptPromise;
  if (!loaded) gptPromise = null;
  return loaded;
}

function installRewardedListeners(tag: GoogleTag) {
  if (rewardedListenersReady) return;
  rewardedListenersReady = true;
  const pubads = tag.pubads();
  pubads.addEventListener('rewardedSlotReady', (event) => {
    if (event.slot !== activeReward?.slot) return;
    if (!event.makeRewardedVisible?.()) activeReward.finish('unavailable');
  });
  pubads.addEventListener('rewardedSlotGranted', (event) => {
    if (event.slot === activeReward?.slot) activeReward.granted = true;
  });
  pubads.addEventListener('rewardedSlotClosed', (event) => {
    if (event.slot === activeReward?.slot)
      activeReward.finish(activeReward.granted ? 'granted' : 'closed');
  });
}

export async function showRewardedAd(): Promise<RewardedAdResult> {
  if (
    !ADS_ENABLED ||
    !REWARDED_UNIT.startsWith('/') ||
    readAdConsent() !== 'accepted' ||
    !(await tcfConsentAllowsAds()) ||
    activeReward
  )
    return 'unavailable';
  if (!(await loadGooglePublisherTag())) return 'unavailable';

  return new Promise((resolve) => {
    const tag = window.googletag;
    if (!tag) return resolve('unavailable');
    let timer = 0;
    const finish = (result: RewardedAdResult) => {
      if (activeReward?.slot) tag.destroySlots([activeReward.slot]);
      activeReward = undefined;
      window.clearTimeout(timer);
      resolve(result);
    };
    timer = window.setTimeout(() => finish('unavailable'), 30000);

    tag.cmd.push(() => {
      const slot = tag.defineOutOfPageSlot(REWARDED_UNIT, tag.enums.OutOfPageFormat.REWARDED);
      if (!slot) return finish('unavailable');
      activeReward = { slot, finish, granted: false };
      slot.addService(tag.pubads());
      installRewardedListeners(tag);
      if (!gptServicesEnabled) {
        tag.enableServices();
        gptServicesEnabled = true;
      }
      tag.display(slot);
    });
  });
}
