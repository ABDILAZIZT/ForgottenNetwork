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

export function readTier(): SubscriptionTier {
  const tier = localStorage.getItem('fn_subscription_tier');
  if (tier === 'artist' || tier === 'vip' || tier === 'free') return tier;
  return localStorage.getItem('fn_user_vip') === 'true' ? 'vip' : 'free';
}

export function dailyCount(key: string, dateKey: string, now = new Date()) {
  return localStorage.getItem(dateKey) === todayKey(now) ? readNumber(key) : 0;
}

export function effectiveStreak(now = new Date()): number {
  const last = new Date(localStorage.getItem('fn_last_reward_date') || '');
  // Compare calendar dates in UTC to avoid daylight-saving 23/25-hour days.
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const gap = (day(now) - day(last)) / 86400000;
  return gap === 0 || gap === 1 ? readNumber('fn_streak_count') : 0;
}

export const DAILY_REWARDS = [25, 30, 50, 30, 35, 40, 100];
export function dailyReward(tier: SubscriptionTier, streak = effectiveStreak()) {
  return DAILY_REWARDS[streak % 7] * (tier === 'vip' ? 2 : 1);
}

export function brushLimit(tier: SubscriptionTier, now = Date.now()) {
  return tier !== 'free' ? 24 : readNumber('fn_brush_boost_until') > now ? 8 : 4;
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
export function readBeacons(): Beacon[] {
  return readArray('fn_beacons', (value): value is Beacon => {
    if (!value || typeof value !== 'object') return false;
    const beacon = value as Beacon;
    return (
      typeof beacon.id === 'string' &&
      typeof beacon.name === 'string' &&
      Number.isFinite(beacon.x) &&
      Number.isFinite(beacon.y)
    );
  });
}

export type MarketCategory = 'Tools' | 'Effects' | 'Premium';
export interface MarketItem {
  id: string;
  name: string;
  cost: number;
  price: string;
  category: MarketCategory;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  previewOnly?: boolean;
}
export const MARKET_ITEMS: MarketItem[] = [
  {
    id: 'rainbow_brush',
    name: 'Rainbow Brush',
    cost: 150,
    price: '$0.99',
    category: 'Tools',
    rarity: 'rare',
    description: 'Paint rainbow strokes in the Studio; export your art as PNG.',
  },
  {
    id: 'glow_pen',
    name: 'Glow Pen',
    cost: 200,
    price: '$1.49',
    category: 'Tools',
    rarity: 'rare',
    description: 'Paint luminous strokes in the Studio and export them.',
  },
  {
    id: 'pixel_stamps',
    name: 'Pixel Stamp Pack',
    cost: 250,
    price: '$1.99',
    category: 'Tools',
    rarity: 'rare',
    description: 'Ten geometric pixel stamps in the Studio.',
  },
  {
    id: 'gradient_fill',
    name: 'Gradient Fill Tool',
    cost: 300,
    price: '$2.49',
    category: 'Tools',
    rarity: 'epic',
    description: 'Fill your Studio tile with a two-color gradient.',
  },
  {
    id: 'neon_aura',
    name: 'Neon Aura',
    cost: 300,
    price: '$1.99',
    category: 'Effects',
    rarity: 'rare',
    description: 'A soft neon halo follows your pointer on this device.',
  },
  {
    id: 'particle_trail',
    name: 'Particle Trail',
    cost: 350,
    price: '$2.49',
    category: 'Effects',
    rarity: 'epic',
    description: 'A sparkle trail follows your pointer on this device.',
  },
  {
    id: 'custom_palettes',
    name: 'Custom Color Palette',
    cost: 400,
    price: '$2.99',
    category: 'Effects',
    rarity: 'epic',
    description: 'Five palettes for the Studio.',
  },
  {
    id: 'avatar_frame',
    name: 'Animated Avatar Frame',
    cost: 500,
    price: '$3.99',
    category: 'Effects',
    rarity: 'epic',
    description: 'An animated profile border visible on this device.',
  },
  {
    id: 'night_vision',
    name: 'Night Vision Mode',
    cost: 600,
    price: '$4.99',
    category: 'Effects',
    rarity: 'epic',
    description: 'Brighten the canvas display locally without changing saved art.',
  },
  {
    id: 'expanded_canvas',
    name: 'Expanded Canvas Area',
    cost: 800,
    price: '$4.99',
    category: 'Premium',
    rarity: 'legendary',
    description: 'Larger personal protected zones need server ownership support. Preview only.',
    previewOnly: true,
  },
  {
    id: 'priority_rendering',
    name: 'Priority Rendering',
    cost: 1000,
    price: '$6.99',
    category: 'Premium',
    rarity: 'legendary',
    description: 'Visitor rendering priority needs server support. Preview only.',
    previewOnly: true,
  },
  {
    id: 'minimap_skin',
    name: 'Custom Minimap Skin',
    cost: 700,
    price: '$4.99',
    category: 'Premium',
    rarity: 'epic',
    description: 'A cyan and gold frame for your minimap.',
  },
  {
    id: 'vip_badge',
    name: 'VIP Badge',
    cost: 1200,
    price: '$7.99',
    category: 'Premium',
    rarity: 'legendary',
    description: 'A golden crown on your local explorer profile.',
  },
  {
    id: 'midnight_cyber',
    name: 'Midnight Cyber',
    cost: 1500,
    price: '$9.99',
    category: 'Premium',
    rarity: 'legendary',
    description: 'Fifteen midnight colors in the Studio.',
  },
];
export const COIN_PACKS = [
  { coins: 100, price: '$0.99' },
  { coins: 500, price: '$3.99' },
  { coins: 1000, price: '$6.99' },
  { coins: 5000, price: '$24.99' },
];
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
export function readMarket() {
  try {
    const value = JSON.parse(localStorage.getItem('fn_market_v1') || 'null');
    if (
      value &&
      Number.isSafeInteger(value.coins) &&
      value.coins >= 0 &&
      Array.isArray(value.owned)
    )
      return { coins: value.coins as number, owned: value.owned.filter(isString) as string[] };
  } catch {
    /* A malformed or unavailable store starts a fresh demo. */
  }
  return { coins: 150, owned: [] as string[] };
}
export function purchaseMarketItem(id: string) {
  const item = MARKET_ITEMS.find((entry) => entry.id === id);
  const ledger = readMarket();
  if (!item || item.previewOnly) return 'This feature is a preview.';
  if (ledger.owned.includes(id)) return 'Already owned.';
  if (ledger.coins < item.cost) return 'Not enough demo coins.';
  try {
    localStorage.setItem(
      'fn_market_v1',
      JSON.stringify({ coins: ledger.coins - item.cost, owned: [...ledger.owned, id] }),
    );
    return 'Purchased';
  } catch {
    return 'Device storage is unavailable. No purchase was saved.';
  }
}
export function topUpMarketDemo() {
  const ledger = readMarket();
  localStorage.setItem(
    'fn_market_v1',
    JSON.stringify({ ...ledger, coins: Math.min(100000, ledger.coins + 1500) }),
  );
}
