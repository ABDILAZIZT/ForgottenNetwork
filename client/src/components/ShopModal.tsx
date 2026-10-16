import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Brush,
  Check,
  Coins,
  Crown,
  Gem,
  Gift,
  Lock,
  Map,
  RadioTower,
  Shield,
  ShoppingBag,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import SubscriptionBadge, { type SubscriptionTier } from './SubscriptionBadge';
import { isString, readArray } from '../economy';
import { useModal } from './useModal';
import MarketCatalog from './MarketCatalog';
import AdSlot from './AdSlot';
import { rewardedAdsConfigured } from '../ads';

type ShopTab = 'subscriptions' | 'bundles' | 'items' | 'rewards';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userGems: number;
  onAddGems: (amount: number) => void;
  subscriptionTier: SubscriptionTier;
  onActivateSubscription: (tier: 'artist' | 'vip') => void;
  ownedItems: string[];
  onPurchaseItem: (itemId: string, cost: number) => void;
  streakCount: number;
  adsWatchedToday: number;
  initialTab?: ShopTab;
  worldPosition?: { x: number; y: number };
  onWatchAd?: () => void;
}

const tiers: Array<{
  id: SubscriptionTier;
  name: string;
  price: string;
  badge?: string;
  icon: JSX.Element;
  copy: string;
  features: string[];
}> = [
  {
    id: 'free',
    name: 'Free Explorer',
    price: 'Free',
    icon: <Sparkles size={26} />,
    copy: 'Browse the living world, read the coordinates, and watch the unknown unfold.',
    features: [
      'Explore forever',
      'Full studio after artist sign-in',
      'All brush sizes and palettes',
      'Daily rewards + optional demo ads',
    ],
  },
  {
    id: 'artist',
    name: 'Cyber Artist Pass',
    price: 'Free demo',
    icon: <Brush size={26} />,
    copy: 'Try a local membership badge and daily rewards.',
    features: ['All studio tools remain free', '300 demo gem activation reward'],
  },
  {
    id: 'vip',
    name: 'Cyber VIP Crown',
    price: 'Free demo',
    icon: <Crown size={26} />,
    copy: 'For community builders, streamers, and world architects. This world exists because of you.',
    features: [
      'Local area markers (no ownership)',
      '800 total demo gem activation reward',
      'Ad-free',
    ],
  },
];

const featureRows = [
  ['World exploration', 'Yes', 'Yes', 'Yes'],
  ['Studio layers', 'Up to 8', 'Up to 8', 'Up to 8'],
  ['World brush size', '1-64px', '1-64px', '1-64px'],
  ['Uploads', 'Server limits apply', 'Server limits apply', 'Server limits apply'],
  ['Palette', 'All + custom', 'All + custom', 'All + custom'],
  ['Activation gems', '-', '300 once', '800 total'],
  ['Local land claims', 'Gem license', 'Gem license', 'Up to 3 chunks'],
  ['Optional rewarded ads', 'Up to 10/day', 'Up to 15/day', 'Ad-free'],
];

const bundles: Array<{
  name: string;
  gems: number;
  price: string;
  note: string;
  badge?: string;
  vipOnly?: boolean;
}> = [
  {
    name: 'Daily Explorer Cache',
    gems: 75,
    price: 'Free demo',
    note: 'A small daily allowance for trying the local demo shop. No payment is collected.',
    vipOnly: false,
  },
];

export const GEM_SHOP_ITEMS = [
  {
    id: 'chunk_visitor_map',
    name: 'Chunk Density Map',
    cost: 100,
    icon: <Map size={22} />,
    description: 'Highlights painted areas in the current chunk.',
    effect:
      'Toggle Pixel density map in World unlocks. Brighter cells contain more painted pixels.',
  },
  {
    id: 'teleport_beacon',
    name: 'Teleport Beacon',
    cost: 80,
    icon: <RadioTower size={22} />,
    description: 'Creates a named world bookmark others can visit.',
    effect: 'Saves your current location. Rename, visit, or share it from World unlocks.',
    repeatable: true,
  },
  {
    id: 'land_license',
    name: 'Land License',
    cost: 500,
    icon: <Shield size={22} />,
    description: 'Claims one 128x128 chunk locally for 30 days.',
    effect: 'Marks the chunk under your camera. Local simulation only; not multiplayer protection.',
    repeatable: true,
  },
];

export default function ShopModal({
  isOpen,
  onClose,
  userGems,
  onAddGems,
  subscriptionTier,
  onActivateSubscription,
  ownedItems,
  onPurchaseItem,
  streakCount,
  adsWatchedToday,
  initialTab = 'subscriptions',
  worldPosition,
  onWatchAd,
}: Props) {
  const [activeTab, setActiveTab] = useState<ShopTab>(initialTab);
  const [collection, setCollection] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setNotice(null);
    return () => clearTimeout(noticeTimer.current);
  }, [isOpen]);
  const modalRef = useModal(isOpen, onClose);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  const transactions = useMemo(() => {
    try {
      return readArray('fn_gem_transactions', isString);
    } catch {
      return [];
    }
  }, [userGems, ownedItems]);

  if (!isOpen) return null;

  const notify = (message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  };

  const buyBundle = (amount: number, label: string) => {
    onAddGems(amount);
    notify(`${label}: requested 75 free demo gems. One grant per day, 100,000 balance cap.`);
  };

  const activateTier = (tier: SubscriptionTier) => {
    if (tier === 'free') return;
    onActivateSubscription(tier);
    notify(`${tier === 'vip' ? 'Cyber VIP Crown' : 'Cyber Artist Pass'} activated.`);
  };

  const tabs: Array<[ShopTab, JSX.Element, string]> = [
    ['subscriptions', <Crown size={16} />, 'Subscriptions'],
    ['bundles', <Gem size={16} />, 'Gem Bundles'],
    ['items', <ShoppingBag size={16} />, 'Gem Shop'],
    ['rewards', <Gift size={16} />, 'My Rewards'],
  ];

  return (
    <div className="fn-shop-overlay">
      <div
        className="fn-shop-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Cyber Market"
        tabIndex={-1}
      >
        <div className="fn-shop-aurora" />
        <div className="fn-shop-header">
          <div className="fn-shop-title">
            <ShoppingBag className="icon-shop" size={24} />
            <div>
              <h3>Cyber Market</h3>
              <p>Demo market. Try memberships and gems for free. No payment is collected.</p>
            </div>
          </div>
          <button className="fn-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="fn-balance-bar">
          <div className="fn-balance-item">
            <Coins className="icon-gems" size={18} />
            <span>
              Gems <strong>{userGems}</strong>
            </span>
          </div>
          <div className="fn-balance-item">
            Membership <SubscriptionBadge tier={subscriptionTier} />
            {subscriptionTier === 'free' && <strong>Free Explorer</strong>}
          </div>
        </div>

        {notice && (
          <div className="fn-notice-banner">
            <Check size={18} />
            <span>{notice}</span>
          </div>
        )}

        <div className="fn-shop-tabs">
          {tabs.map(([id, icon, label]) => (
            <button
              key={id}
              className={`tab-btn ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="fn-shop-content">
          <button
            className="buy-btn"
            onClick={() => setCollection(!collection)}
            aria-expanded={collection}
          >
            🎨 {collection ? 'Hide' : 'Explore'} Creator Collection & Studio
          </button>
          {collection && (
            <MarketCatalog showAds={subscriptionTier !== 'vip'} position={worldPosition} />
          )}
          {activeTab === 'subscriptions' && (
            <>
              <p>
                All drawing tools are free. These memberships only change local demo rewards and
                badges.
              </p>
              <div className="fn-tier-grid">
                {tiers.map((tier) => (
                  <div key={tier.id} className={`fn-shop-card tier-card ${tier.id}`}>
                    {tier.badge && <div className="card-badge pulse">{tier.badge}</div>}
                    <div className="card-icon">{tier.icon}</div>
                    <h4>{tier.name}</h4>
                    <div className="tier-price">{tier.price}</div>
                    <p>{tier.copy}</p>
                    <ul>
                      {tier.features.map((feature) => (
                        <li key={feature}>
                          <BadgeCheck size={14} />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button
                      className="buy-btn"
                      disabled={
                        subscriptionTier === tier.id ||
                        tier.id === 'free' ||
                        subscriptionTier === 'vip'
                      }
                      onClick={() => activateTier(tier.id)}
                    >
                      {subscriptionTier === tier.id
                        ? 'Active'
                        : tier.id === 'free'
                          ? 'Included'
                          : subscriptionTier === 'vip'
                            ? 'Included in VIP'
                            : `Try demo ${tier.name}`}
                    </button>
                  </div>
                ))}
              </div>

              <table className="feature-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Free</th>
                    <th>Artist</th>
                    <th>VIP</th>
                  </tr>
                </thead>
                <tbody>
                  {featureRows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => (
                        <td key={index}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {activeTab === 'bundles' && (
            <div className="fn-cards-grid">
              {bundles.map((bundle) => {
                const locked = Boolean(bundle.vipOnly && subscriptionTier !== 'vip');
                return (
                  <div
                    key={bundle.name}
                    className={`fn-shop-card bundle-card ${locked ? 'locked' : ''}`}
                  >
                    {bundle.badge && (
                      <div
                        className={`card-badge ${bundle.badge.includes('VALUE') ? 'gold pulse' : 'hot'}`}
                      >
                        {bundle.badge}
                      </div>
                    )}
                    {locked && <Lock className="lock-mark" size={20} />}
                    <Coins size={38} className="bundle-gem" />
                    <h4>{bundle.name}</h4>
                    <div className="gem-amount">{bundle.gems.toLocaleString()} gems</div>
                    <p>{bundle.note}</p>
                    <button
                      className="buy-btn"
                      disabled={locked}
                      onClick={() => buyBundle(bundle.gems, bundle.name)}
                    >
                      {locked ? 'VIP demo' : 'Request free demo gems'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'items' && (
            <>
              <div className="fn-items-grid">
                {GEM_SHOP_ITEMS.map((item, index) => {
                  const owned = ownedItems.includes(item.id) && !item.repeatable;
                  const disabled = owned || userGems < item.cost;
                  return [
                    <div key={item.id} className="item-box">
                      <div className="item-icon">{item.icon}</div>
                      <div className="item-title-row">
                        <h4>{item.name}</h4>
                        {owned && <span className="owned-badge">Owned</span>}
                      </div>
                      <p>{item.description}</p>
                      <small>{item.effect}</small>
                      <button
                        className="buy-btn-sm"
                        disabled={disabled}
                        onClick={() => onPurchaseItem(item.id, item.cost)}
                      >
                        {owned
                          ? 'Owned'
                          : userGems >= item.cost
                            ? `${item.cost} gems`
                            : 'Not enough gems'}
                      </button>
                    </div>,
                    ...(index === 0 && subscriptionTier !== 'vip'
                      ? [
                          <AdSlot
                            key="ad-slot-marketplace-feed"
                            slotId="ad-slot-marketplace-feed"
                            size="rectangle"
                            position="marketplace-feed"
                          />,
                        ]
                      : []),
                  ];
                })}
              </div>
              {subscriptionTier !== 'vip' &&
                onWatchAd &&
                (import.meta.env.DEV || rewardedAdsConfigured()) &&
                GEM_SHOP_ITEMS.some(
                  (item) => userGems < item.cost && !ownedItems.includes(item.id),
                ) && (
                  <button className="buy-btn fn-low-balance-cta" onClick={onWatchAd}>
                    Not enough gems? Watch an optional rewarded ad for demo gems.
                  </button>
                )}
            </>
          )}

          {activeTab === 'rewards' && (
            <div className="rewards-panel">
              <div className="reward-stat hero-stat">
                <Coins size={24} />
                <span>{userGems.toLocaleString()}</span>
                <small>Current gem balance</small>
              </div>
              <div className="reward-stat">
                <Gift size={22} />
                <span>{streakCount} days</span>
                <small>Current streak</small>
              </div>
              <div className="reward-stat">
                <Zap size={22} />
                <span>
                  {subscriptionTier === 'vip'
                    ? 'Ad-free'
                    : `${Math.max(0, (subscriptionTier === 'artist' ? 15 : 10) - adsWatchedToday)} remaining`}
                </span>
                <small>Ads remaining today</small>
              </div>
              <div className="streak-progress">
                <div>
                  <strong>7-day milestone</strong>
                  <span>
                    {streakCount ? ((streakCount - 1) % 7) + 1 : 0} / 7 toward{' '}
                    {subscriptionTier === 'vip' ? 200 : 100} gems
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    style={{
                      width: `${Math.min(100, ((streakCount % 7 || streakCount) / 7) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="transaction-list">
                <h4>Recent gem transactions</h4>
                {(transactions.length
                  ? transactions.slice(-5).reverse()
                  : ['No gem transactions yet.']
                ).map((entry, index) => (
                  <p key={index}>{entry}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="fn-shop-footer">
          {subscriptionTier !== 'vip' && (
            <AdSlot slotId="ad-slot-footer" size="banner" position="shop-footer" />
          )}
          <p>Demo only: memberships, gems, and claims are saved on this device.</p>
          <p>Live billing and shared land protection are not connected.</p>
        </div>
      </div>

      <style>{`
        .fn-shop-overlay {
          position: fixed;
          inset: 0;
          background: color-mix(in srgb, var(--surface) 86%, transparent);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          direction: ltr;
          font-family: 'Outfit', system-ui, sans-serif;
        }
        .fn-shop-modal {
          position: relative;
          background: var(--surface);
          border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
          box-shadow: 0 0 35px color-mix(in srgb, var(--success) 15%, transparent), 0 20px 50px color-mix(in srgb, var(--shadow-color) 80%, transparent);
          border-radius: 8px;
          width: min(1120px, 100%);
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: var(--text);
          animation: fn-modal-enter 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .fn-shop-aurora {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(120deg, color-mix(in srgb, var(--success) 12%, transparent), color-mix(in srgb, var(--accent-2) 6%, transparent), color-mix(in srgb, var(--danger) 10%, transparent), color-mix(in srgb, var(--warning) 7%, transparent));
          background-size: 300% 300%;
          animation: shop-aurora 12s ease-in-out infinite;
          opacity: 0.75;
        }
        .fn-shop-header, .fn-balance-bar, .fn-shop-tabs, .fn-shop-content, .fn-shop-footer, .fn-notice-banner { position: relative; }
        .fn-shop-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 24px;
          background: color-mix(in srgb, var(--surface-tint) 3%, transparent);
          border-bottom: 1px solid color-mix(in srgb, var(--border) 8%, transparent);
        }
        .fn-shop-title { display: flex; align-items: center; gap: 14px; }
        .icon-shop { color: var(--success); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--success) 50%, transparent)); }
        .fn-shop-title h3 { margin: 0; font-size: 1.35rem; color: var(--text); font-weight: 900; }
        .fn-shop-title p { margin: 3px 0 0; color: var(--text-muted); font-size: 0.82rem; max-width: 680px; }
        .fn-close-btn {
          background: color-mix(in srgb, var(--surface-tint) 3%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 8%, transparent);
          color: var(--text-muted);
          cursor: pointer;
          padding: 7px;
          border-radius: 6px;
        }
        .fn-close-btn:hover { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
        .fn-balance-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          padding: 12px 24px;
          background: color-mix(in srgb, var(--success) 5%, transparent);
          border-bottom: 1px solid color-mix(in srgb, var(--success) 15%, transparent);
        }
        .fn-balance-item { display: inline-flex; align-items: center; gap: 8px; color: var(--text-muted); }
        .fn-balance-item strong, .icon-gems { color: var(--success); }
        .fn-notice-banner {
          background: color-mix(in srgb, var(--success) 12%, transparent);
          border-bottom: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
          color: var(--success);
          padding: 10px 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
        }
        .fn-shop-tabs {
          display: flex;
          gap: 8px;
          padding: 12px 24px 0;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 8%, transparent);
          overflow-x: auto;
        }
        .tab-btn {
          background: transparent;
          border: 0;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          padding: 10px 14px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }
        .tab-btn:hover, .tab-btn.active { color: var(--success); }
        .tab-btn.active { border-bottom-color: var(--success); }
        .fn-shop-content { padding: 24px; overflow-y: auto; flex: 1; }
        .fn-tier-grid, .fn-cards-grid, .fn-items-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
          gap: 16px;
        }
        .fn-shop-card, .item-box, .reward-stat, .streak-progress, .transaction-list {
          background: color-mix(in srgb, var(--surface-tint) 3%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 8%, transparent);
          border-radius: 8px;
        }
        .fn-shop-card {
          position: relative;
          min-height: 280px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          transform-style: preserve-3d;
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .fn-shop-card:hover {
          transform: perspective(700px) rotateX(2deg) rotateY(-3deg) translateY(-4px);
          border-color: color-mix(in srgb, var(--success) 38%, transparent);
          box-shadow: 0 14px 30px color-mix(in srgb, var(--shadow-color) 32%, transparent);
        }
        .tier-card.artist { border-color: color-mix(in srgb, var(--success) 35%, transparent); }
        .tier-card.vip {
          border-color: color-mix(in srgb, var(--warning) 40%, transparent);
          overflow: hidden;
        }
        .tier-card.vip::before {
          pointer-events: none;
          content: '';
          position: absolute;
          inset: -40%;
          background-image: radial-gradient(circle, color-mix(in srgb, var(--warning) 35%, transparent) 0 1px, transparent 2px);
          background-size: 22px 22px;
          animation: shimmer-drift 9s linear infinite;
          opacity: 0.55;
        }
        .card-icon { color: var(--success); margin: 8px 0; position: relative; }
        .tier-card.vip .card-icon, .bundle-gem { color: var(--warning); }
        .fn-shop-card h4, .item-box h4, .transaction-list h4 { margin: 6px 0; color: var(--text); font-size: 1.05rem; }
        .tier-price, .gem-amount { color: var(--success); font-size: 1.32rem; font-weight: 900; }
        .fn-shop-card p, .item-box p, .item-box small { color: var(--text-muted); font-size: 0.8rem; line-height: 1.45; }
        .fn-shop-card ul { list-style: none; padding: 0; margin: 12px 0 16px; width: 100%; text-align: left; }
        .fn-shop-card li { display: flex; gap: 8px; align-items: center; margin: 7px 0; color: var(--text); font-size: 0.78rem; }
        .fn-shop-card li svg { color: var(--success); flex: 0 0 auto; }
        .card-badge {
          position: absolute;
          top: 6px;
          z-index: 2;
          background: var(--accent-fill);
          color: var(--text);
          font-size: 0.68rem;
          font-weight: 900;
          padding: 3px 10px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--border) 25%, transparent);
        }
        .card-badge.hot { background: var(--accent-fill); }
        .card-badge.gold { background: var(--accent-fill); color: var(--on-accent); }
        .card-badge.pulse { animation: badge-pulse 1.8s ease-in-out infinite; }
        .buy-btn, .buy-btn-sm {
          width: 100%;
          margin-top: auto;
          background: var(--accent-fill);
          color: var(--on-accent);
          border: 0;
          padding: 10px;
          border-radius: 6px;
          font-weight: 900;
          cursor: pointer;
        }
        .buy-btn:hover:not(:disabled), .buy-btn-sm:hover:not(:disabled) { filter: brightness(1.12); }
        .buy-btn:disabled, .buy-btn-sm:disabled {
          background: color-mix(in srgb, var(--surface-tint) 8%, transparent);
          color: var(--text-muted);
          cursor: not-allowed;
        }
        .feature-table {
          width: 100%;
          margin-top: 18px;
          border-collapse: collapse;
          background: color-mix(in srgb, var(--surface-tint) 3%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 8%, transparent);
          border-radius: 8px;
          overflow: hidden;
        }
        .feature-table th, .feature-table td {
          padding: 10px;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 8%, transparent);
          color: var(--text);
          font-size: 0.78rem;
          text-align: left;
        }
        .feature-table th { color: var(--success); background: color-mix(in srgb, var(--success) 6%, transparent); }
        .bundle-card.locked { opacity: 0.55; }
        .lock-mark { position: absolute; right: 14px; top: 14px; color: var(--warning); }
        .item-box { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
        .item-icon { color: var(--success); }
        .item-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .owned-badge {
          color: var(--on-accent);
          background: var(--accent-fill);
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.67rem;
          font-weight: 900;
        }
        .rewards-panel {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 14px;
        }
        .reward-stat { padding: 18px; display: flex; flex-direction: column; gap: 6px; color: var(--success); }
        .reward-stat span { color: var(--text); font-size: 1.45rem; font-weight: 900; }
        .reward-stat small, .streak-progress span, .transaction-list p { color: var(--text-muted); }
        .hero-stat { border-color: color-mix(in srgb, var(--success) 30%, transparent); }
        .streak-progress, .transaction-list { padding: 16px; grid-column: 1 / -1; }
        .streak-progress > div:first-child { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
        .progress-track { height: 9px; background: color-mix(in srgb, var(--surface-tint) 8%, transparent); border-radius: 999px; overflow: hidden; }
        .progress-track div { height: 100%; background: linear-gradient(90deg, var(--accent-fill), var(--accent-fill)); }
        .transaction-list p { margin: 8px 0 0; font-size: 0.82rem; }
        .fn-shop-footer {
          padding: 12px 24px;
          background: color-mix(in srgb, var(--surface-tint) 38%, transparent);
          border-top: 1px solid color-mix(in srgb, var(--border) 8%, transparent);
        }
        .fn-shop-footer p { margin: 3px 0; color: var(--text-muted); font-size: 0.74rem; text-align: center; }
        @keyframes fn-modal-enter {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes shop-aurora {
          0%, 100% { opacity: .5; transform: translateX(-2%); }
          50% { opacity: .8; transform: translateX(2%); }
        }
        @keyframes shimmer-drift {
          from { transform: translate3d(-20px, -20px, 0); }
          to { transform: translate3d(20px, 20px, 0); }
        }
        @keyframes badge-pulse { 50% { opacity: .75; transform: translateY(-1px); } }
        @media (max-width: 720px) {
          .fn-shop-modal { max-height: 96vh; }
          .feature-table { min-width: 620px; }
          .fn-shop-content { overflow-x: auto; }
        }
      `}</style>
    </div>
  );
}
