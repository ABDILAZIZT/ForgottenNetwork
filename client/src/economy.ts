export type SubscriptionTier = 'free' | 'artist' | 'vip';

export function readNumber(key: string, fallback = 0): number {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? fallback : Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function readArray<T>(key: string, valid: (value: unknown) => value is T): T[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(valid) : [];
  } catch {
    return [];
  }
}

export const isString = (value: unknown): value is string => typeof value === 'string';
export const ownedItems = () => readArray('fn_owned_items', isString);
export const todayKey = (now = new Date()) => now.toDateString();

export function explorationGemReward(random: () => number = Math.random) {
  return 2 + Math.min(3, Math.max(0, Math.floor(random() * 4)));
}

export function grantExplorationGems(amount: number) {
  if (!Number.isInteger(amount) || amount < 2 || amount > 5) return false;
  const current = readNumber('fn_user_gems', 150);
  if (current >= 100_000) return false;
  try {
    localStorage.setItem('fn_user_gems', String(Math.min(100_000, current + amount)));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('fn-gems-change'));
    return true;
  } catch {
    return false;
  }
}

export function readTier(): SubscriptionTier {
  const tier = localStorage.getItem('fn_subscription_tier');
  if (tier === 'artist' || tier === 'vip' || tier === 'free') return tier;
  return localStorage.getItem('fn_user_vip') === 'true' ? 'vip' : 'free';
}

export function dailyCount(key: string, dateKey: string, now = new Date()) {
  return localStorage.getItem(dateKey) === todayKey(now) ? readNumber(key) : 0;
}

export const REWARDED_AD_COOLDOWN_MS = 3 * 60 * 1000;

export function rewardedAdLimit(tier: SubscriptionTier) {
  return tier === 'free' ? 10 : 15;
}

export function randomAdReward(random: () => number = Math.random) {
  return 15 + Math.min(10, Math.max(0, Math.floor(random() * 11)));
}

export function canWatchRewardedAd(tier: SubscriptionTier, now = Date.now()) {
  if (tier === 'vip') return false;
  if (dailyCount('fn_ads_today', 'fn_ads_last_date', new Date(now)) >= rewardedAdLimit(tier))
    return false;
  return now - readNumber('fn_last_ad_time') >= REWARDED_AD_COOLDOWN_MS;
}

// This ledger is a local demo convenience, not authoritative reward verification.
export function recordRewardedAd(amount: number, tier: SubscriptionTier, now = Date.now()) {
  if (!Number.isInteger(amount) || amount < 15 || amount > 25 || !canWatchRewardedAd(tier, now))
    return null;
  const count = dailyCount('fn_ads_today', 'fn_ads_last_date', new Date(now));
  try {
    localStorage.setItem('fn_ads_today', String(count + 1));
    localStorage.setItem('fn_ads_last_date', todayKey(new Date(now)));
    localStorage.setItem('fn_last_ad_time', String(now));
    return count + 1;
  } catch {
    return null;
  }
}

export function effectiveStreak(now = new Date()): number {
  const last = new Date(localStorage.getItem('fn_last_reward_date') || '');
  // Compare calendar dates in UTC to avoid daylight-saving 23/25-hour days.
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const gap = (day(now) - day(last)) / 86400000;
  return gap === 0 || gap === 1 ? readNumber('fn_streak_count') : 0;
}

export const DAILY_REWARDS = [40, 45, 50, 45, 55, 60, 100];
export function dailyReward(tier: SubscriptionTier, streak = effectiveStreak()) {
  return DAILY_REWARDS[streak % 7] * (tier === 'vip' ? 2 : 1);
}

export interface LandClaim {
  cx: number;
  cy: number;
  owner: string;
  expiresAt: number;
}
export function readClaims(): LandClaim[] {
  return readArray('fn_claimed_chunks', (value): value is LandClaim => {
    if (!value || typeof value !== 'object') return false;
    const claim = value as LandClaim;
    return (
      Number.isInteger(claim.cx) &&
      Number.isInteger(claim.cy) &&
      typeof claim.owner === 'string' &&
      Number.isFinite(claim.expiresAt) &&
      claim.expiresAt > Date.now()
    );
  });
}

export interface Beacon {
  id: string;
  name: string;
  x: number;
  y: number;
}

function isBeacon(value: unknown): value is Beacon {
  if (!value || typeof value !== 'object') return false;
  const beacon = value as Beacon;
  return (
    typeof beacon.id === 'string' &&
    typeof beacon.name === 'string' &&
    Number.isFinite(beacon.x) &&
    Number.isFinite(beacon.y)
  );
}

export function readBeacons(): Beacon[] {
  const combined = new Map<string, Beacon>();
  for (const beacon of readMarket().beacons) combined.set(beacon.id, beacon);
  for (const beacon of readArray('fn_beacons', isBeacon)) combined.set(beacon.id, beacon);
  return [...combined.values()];
}

export type MarketCategory = 'Brushes' | 'Land' | 'Creatures' | 'Cosmetics';
export interface MarketItem {
  id: string;
  name: string;
  cost: number;
  price: string;
  category: MarketCategory;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  previewOnly?: boolean;
  repeatable?: boolean;
  requiresLocation?: boolean;
}
export const MARKET_ITEMS: MarketItem[] = [
  {
    id: 'rainbow_brush',
    name: 'Rainbow Brush',
    cost: 150,
    price: '$0.99',
    category: 'Brushes',
    rarity: 'rare',
    description: 'Paint rainbow strokes in the Studio; export your art as PNG.',
  },
  {
    id: 'glow_pen',
    name: 'Glow Pen',
    cost: 200,
    price: '$1.49',
    category: 'Brushes',
    rarity: 'rare',
    description: 'Paint luminous strokes in the Studio and export them.',
  },
  {
    id: 'pixel_stamps',
    name: 'Pixel Stamp Pack',
    cost: 250,
    price: '$1.99',
    category: 'Brushes',
    rarity: 'rare',
    description: 'Ten geometric pixel stamps in the Studio.',
  },
  {
    id: 'gradient_fill',
    name: 'Gradient Fill Tool',
    cost: 300,
    price: '$2.49',
    category: 'Brushes',
    rarity: 'epic',
    description: 'Fill your Studio tile with a two-color gradient.',
  },
  {
    id: 'neon_aura',
    name: 'Neon Aura',
    cost: 300,
    price: '$1.99',
    category: 'Cosmetics',
    rarity: 'rare',
    description: 'A soft neon halo follows your pointer on this device.',
  },
  {
    id: 'particle_trail',
    name: 'Particle Trail',
    cost: 350,
    price: '$2.49',
    category: 'Cosmetics',
    rarity: 'epic',
    description: 'A sparkle trail follows your pointer on this device.',
  },
  {
    id: 'custom_palettes',
    name: 'Custom Color Palette',
    cost: 400,
    price: '$2.99',
    category: 'Cosmetics',
    rarity: 'epic',
    description: 'Five palettes for the Studio.',
  },
  {
    id: 'avatar_frame',
    name: 'Animated Avatar Frame',
    cost: 500,
    price: '$3.99',
    category: 'Cosmetics',
    rarity: 'epic',
    description: 'An animated profile border visible on this device.',
  },
  {
    id: 'night_vision',
    name: 'Night Vision Mode',
    cost: 600,
    price: '$4.99',
    category: 'Cosmetics',
    rarity: 'epic',
    description: 'Brighten the canvas display locally without changing saved art.',
  },
  {
    id: 'expanded_canvas',
    name: 'Expanded Canvas Area',
    cost: 800,
    price: '$4.99',
    category: 'Land',
    rarity: 'legendary',
    description: 'Larger personal protected zones need server ownership support. Preview only.',
    previewOnly: true,
  },
  {
    id: 'minimap_skin',
    name: 'Custom Minimap Skin',
    cost: 700,
    price: '$4.99',
    category: 'Cosmetics',
    rarity: 'epic',
    description: 'A cyan and gold frame for your minimap.',
  },
  {
    id: 'vip_badge',
    name: 'VIP Badge',
    cost: 1200,
    price: '$7.99',
    category: 'Cosmetics',
    rarity: 'legendary',
    description: 'A golden crown on your local explorer profile.',
  },
  {
    id: 'midnight_cyber',
    name: 'Midnight Cyber',
    cost: 1500,
    price: '$9.99',
    category: 'Cosmetics',
    rarity: 'legendary',
    description: 'Fifteen midnight colors in the Studio.',
  },
  {
    id: 'waypoint_marker',
    name: 'Waypoint Marker',
    cost: 100,
    price: 'Demo only',
    category: 'Land',
    rarity: 'common',
    description: 'Save a local visit marker at your current canvas position.',
    repeatable: true,
    requiresLocation: true,
  },
  {
    id: 'creature_stamps',
    name: 'Pixel Creature Stamp Pack',
    cost: 250,
    price: 'Demo only',
    category: 'Creatures',
    rarity: 'rare',
    description: 'Stamp a little fox, moth, fish, sprout, or cloud in your exported Studio tile.',
  },
  {
    id: 'palette_sunset',
    name: 'Sunset Palette',
    cost: 120,
    price: 'Demo only',
    category: 'Cosmetics',
    rarity: 'common',
    description: 'A warm gradient palette for the pocket Studio.',
  },
  {
    id: 'palette_forest',
    name: 'Forest Palette',
    cost: 120,
    price: 'Demo only',
    category: 'Cosmetics',
    rarity: 'common',
    description: 'A leafy green palette for the pocket Studio.',
  },
  {
    id: 'palette_ocean',
    name: 'Ocean Palette',
    cost: 120,
    price: 'Demo only',
    category: 'Cosmetics',
    rarity: 'common',
    description: 'A deep blue palette for the pocket Studio.',
  },
];
export const COIN_PACKS = [
  { coins: 100, price: '$0.99' },
  { coins: 500, price: '$3.99' },
  { coins: 1000, price: '$6.99' },
  { coins: 5000, price: '$24.99' },
];
export interface MarketLedger {
  coins: number;
  owned: string[];
  nextGrantAt: number;
  beacons: Beacon[];
  transactions: string[];
}
export const CREATOR_BUNDLES = [
  { name: 'Starter Bundle', price: '$7.99', description: 'Rainbow Brush + Neon Aura + 500 coins' },
  { name: 'Creator Bundle', price: '$14.99', description: 'All Tools + All Effects + 1000 coins' },
  {
    name: 'Ultimate Bundle',
    price: '$19.99',
    description: 'Everything + 3000 coins + VIP Badge; planned features require server support',
  },
];

// A single local ledger write makes each demo purchase atomic. Never use this for real billing.
export function readMarket(): MarketLedger {
  try {
    const value = JSON.parse(localStorage.getItem('fn_market_v1') || 'null');
    if (
      value &&
      Number.isSafeInteger(value.coins) &&
      value.coins >= 0 &&
      Array.isArray(value.owned)
    )
      return {
        coins: value.coins as number,
        owned: value.owned.filter(isString) as string[],
        nextGrantAt:
          Number.isSafeInteger(value.nextGrantAt) && value.nextGrantAt >= 0 ? value.nextGrantAt : 0,
        beacons: Array.isArray(value.beacons) ? value.beacons.filter(isBeacon) : [],
        transactions: Array.isArray(value.transactions)
          ? value.transactions.filter(isString).slice(-20)
          : [],
      };
  } catch {
    /* A malformed or unavailable store starts a fresh demo. */
  }
  return {
    coins: 150,
    owned: [] as string[],
    nextGrantAt: 0,
    beacons: [] as Beacon[],
    transactions: [] as string[],
  };
}
export function purchaseMarketItem(id: string, position?: { x: number; y: number }) {
  const item = MARKET_ITEMS.find((entry) => entry.id === id);
  const ledger = readMarket();
  if (!item || item.previewOnly) return 'This feature is a preview.';
  if (
    item.requiresLocation &&
    (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y))
  )
    return 'Move to a canvas location before purchasing this marker.';
  if (!item.repeatable && ledger.owned.includes(id)) return 'Already owned.';
  if (ledger.coins < item.cost) return 'Not enough demo coins.';
  try {
    const beacon = item.requiresLocation
      ? {
          id: `market-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          name: `Collection marker ${ledger.beacons.length + 1}`,
          x: position!.x,
          y: position!.y,
        }
      : null;
    const nextOwned = item.repeatable ? ledger.owned : [...ledger.owned, id];
    localStorage.setItem(
      'fn_market_v1',
      JSON.stringify({
        ...ledger,
        coins: ledger.coins - item.cost,
        owned: nextOwned,
        beacons: beacon ? [...ledger.beacons, beacon] : ledger.beacons,
        transactions: [...ledger.transactions, `${new Date().toISOString()} · ${item.name}`].slice(
          -20,
        ),
      }),
    );
    if (beacon && typeof window !== 'undefined')
      window.dispatchEvent(new Event('fn-beacons-change'));
    return 'Purchased';
  } catch {
    return 'Device storage is unavailable. No purchase was saved.';
  }
}
export const DEMO_COIN_CAP = 1500;
export const DEMO_COIN_GRANT = 75;
export const DEMO_GRANT_COOLDOWN = 24 * 60 * 60 * 1000;
export function topUpMarketDemo(now = Date.now()) {
  const ledger = readMarket();
  if (now < ledger.nextGrantAt) return 'Free demo coins are available once every 24 hours.';
  if (ledger.coins >= DEMO_COIN_CAP) return `Demo wallet cap reached (${DEMO_COIN_CAP} coins).`;
  const amount = Math.min(DEMO_COIN_GRANT, DEMO_COIN_CAP - ledger.coins);
  localStorage.setItem(
    'fn_market_v1',
    JSON.stringify({
      ...ledger,
      coins: ledger.coins + amount,
      nextGrantAt: now + DEMO_GRANT_COOLDOWN,
      transactions: [
        ...ledger.transactions,
        `${new Date(now).toISOString()} · +${amount} free demo coins`,
      ].slice(-20),
    }),
  );
  return 'Added ' + amount + ' free demo coins. Next grant in 24 hours.';
}
