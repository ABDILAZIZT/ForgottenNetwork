import { useEffect, useMemo, useState } from 'react';
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
  Palette,
  RadioTower,
  Shield,
  ShoppingBag,
  Sparkles,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import SubscriptionBadge, { type SubscriptionTier } from './SubscriptionBadge';
import { isString, readArray } from '../economy';
import { useModal } from './useModal';
import MarketCatalog from './MarketCatalog';
import AdSlot from './AdSlot';

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
    price: '$0',
    icon: <Sparkles size={26} />,
    copy: 'Browse the living world, read the coordinates, and watch the unknown unfold.',
    features: [
      'Explore forever',
      'Main layer drawing after sign-in',
      '1-4px brushes',
      'Daily rewards + optional demo ads',
    ],
  },
  {
    id: 'artist',
    name: 'Cyber Artist Pass',
    price: '$2.99/mo',
    badge: 'Most Popular',
    icon: <Brush size={26} />,
    copy: 'The obvious choice for anyone who wants to actually create here.',
    features: ['All 3 layers', 'Brushes up to 24px', '64 colors + custom hex', '300 gem stipend'],
  },
  {
    id: 'vip',
    name: 'Cyber VIP Crown',
    price: '$6.99/mo',
    badge: 'Best Value',
    icon: <Crown size={26} />,
    copy: 'For community builders, streamers, and world architects. This world exists because of you.',
    features: ['Land claims', '25MB uploads', 'VIP palettes', '800 gem stipend', 'Ad-free'],
  },
];

const featureRows = [
  ['World exploration', 'Yes', 'Yes', 'Yes'],
  ['Drawing layers', 'Main only', 'All 3', 'All 3'],
  ['Brush size', '1-4px', '1-24px', '1-24px + spray'],
  ['Uploads', '3/day, 512KB', '10/day, 5MB', 'Unlimited, 25MB'],
  ['Palette', '16 colors', '64 + custom hex', '256+ + VIP themes'],
  ['Activation gems', '-', '300 once', '800 total'],
  ['Local land claims', 'Gem license', 'Gem license', 'Up to 3 chunks'],
  ['Ads', '3/day available', '3/day available', 'Ad-free'],
];

const bundles = [
  {
    name: 'Spark',
    gems: 100,
    price: '$0.99',
    note: 'Dip your toes in. One spark to light your first creation.',
  },
  {
    name: 'Artist Bundle',
    gems: 650,
    price: '$4.99',
    badge: 'BESTSELLER',
    note: 'A week of progress in one clean jump, with 50 bonus gems tucked in.',
  },
  {
    name: 'Creator Pack',
    gems: 1800,
    price: '$11.99',
    badge: 'BEST VALUE',
    note: 'Enough fuel for dedicated builders who keep coming back.',
  },
  {
    name: 'Legend Hoard',
    gems: 5000,
    price: '$29.99',
    badge: 'VIP EXCLUSIVE',
    note: 'Go all-in. Build empires. Leave your mark on the Forgotten Network forever.',
    vipOnly: true,
  },
];

export const GEM_SHOP_ITEMS = [
  {
    id: 'extra_upload_slot',
    name: 'Extra Upload Slot',
    cost: 50,
    icon: <Upload size={22} />,
    description: 'Adds +3 media uploads for today.',
    effect: 'Updates your daily upload allowance immediately for this browser.',
    repeatable: true,
  },
  {
    id: 'brush_size_boost',
    name: 'Brush Size Boost',
    cost: 75,
    icon: <Zap size={22} />,
    description: 'Temporarily unlocks brushes up to 8px for one hour.',
    effect: 'Free members can paint larger strokes until the timer expires.',
    repeatable: true,
  },
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
    id: 'palette_neon_noir',
    name: 'Palette Unlock: Neon Noir',
    cost: 120,
    icon: <Palette size={22} />,
    description: 'Permanently unlocks a 16-color neon palette.',
    effect: 'Select Neon Noir in the drawing color palette.',
  },
  {
    id: 'palette_fossil',
    name: 'Palette Unlock: Fossil',
    cost: 120,
    icon: <Palette size={22} />,
    description: 'Permanently unlocks earthy fossil-tone colors.',
    effect: 'Select Fossil in the drawing color palette.',
  },
  {
    id: 'spray_brush',
    name: 'Spray Brush',
    cost: 200,
    icon: <Sparkles size={22} />,
    description: 'Unlocks the spray brush tool permanently for Tier 1 users.',
    effect: 'Select Spray in Brush style to paint scattered pixels.',
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
}: Props) {
  const [activeTab, setActiveTab] = useState<ShopTab>(initialTab);
  const [annual, setAnnual] = useState(false);
  const [collection, setCollection] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
    window.setTimeout(() => setNotice(null), 3200);
  };

  const buyBundle = (amount: number, label: string) => {
    onAddGems(amount);
    notify(`${label} added ${amount} gems.`);
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
          {collection && <MarketCatalog />}
          {activeTab === 'subscriptions' && (
            <>
              <label className="billing-toggle">
                <input
                  type="checkbox"
                  checked={annual}
                  onChange={(e) => setAnnual(e.target.checked)}
                />
                <span>Preview annual pricing (20% off)</span>
              </label>
              <div className="fn-tier-grid">
                {tiers.map((tier) => (
                  <div key={tier.id} className={`fn-shop-card tier-card ${tier.id}`}>
                    {tier.badge && <div className="card-badge pulse">{tier.badge}</div>}
                    <div className="card-icon">{tier.icon}</div>
                    <h4>{tier.name}</h4>
                    <div className="tier-price">
                      {annual && tier.id !== 'free'
                        ? tier.id === 'artist'
                          ? '$28.70/year'
                          : '$67.10/year'
                        : tier.price}
                    </div>
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
                      {locked ? 'VIP Exclusive' : `Try demo bundle (${bundle.price})`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'items' && (
            <div className="fn-items-grid">
              {GEM_SHOP_ITEMS.map((item) => {
                const owned = ownedItems.includes(item.id) && !item.repeatable;
                const disabled = owned || userGems < item.cost;
                return (
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
                  </div>
                );
              })}
            </div>
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
                    : `${Math.max(0, 3 - adsWatchedToday)} of 3`}
                </span>
                <small>Ads remaining today</small>
              </div>
              <div className="streak-progress">
                <div>
                  <strong>7-day milestone</strong>
                  <span>
                    {streakCount ? ((streakCount - 1) % 7) + 1 : 0} / 7 toward Neon Noir +{' '}
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
            <AdSlot slotId="classic-shop" size="banner" position="shop-footer" />
          )}
          <p>Demo only: memberships, gems, and claims are saved on this device.</p>
          <p>Live billing and shared land protection are not connected.</p>
        </div>
      </div>

      <style>{`
        .fn-shop-overlay {
          position: fixed;
          inset: 0;
          background: rgba(5, 5, 12, 0.86);
          backdrop-filter: blur(9px);
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
          background: #0d0e17;
          border: 1px solid rgba(0,230,184,0.3);
          box-shadow: 0 0 35px rgba(0,230,184,0.15), 0 20px 50px rgba(0,0,0,0.8);
          border-radius: 8px;
          width: min(1120px, 100%);
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: #e2e8f0;
          animation: fn-modal-enter 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .fn-shop-aurora {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(120deg, rgba(0,230,184,0.12), rgba(51,136,255,0.06), rgba(255,68,204,0.1), rgba(255,170,0,0.07));
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
          background: rgba(255,255,255,0.03);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .fn-shop-title { display: flex; align-items: center; gap: 14px; }
        .icon-shop { color: #00e6b8; filter: drop-shadow(0 0 8px rgba(0,230,184,0.5)); }
        .fn-shop-title h3 { margin: 0; font-size: 1.35rem; color: #e2e8f0; font-weight: 900; }
        .fn-shop-title p { margin: 3px 0 0; color: #94a3b8; font-size: 0.82rem; max-width: 680px; }
        .fn-close-btn {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          color: #94a3b8;
          cursor: pointer;
          padding: 7px;
          border-radius: 6px;
        }
        .fn-close-btn:hover { color: #ff4466; border-color: rgba(255,68,102,0.4); }
        .fn-balance-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          padding: 12px 24px;
          background: rgba(0,230,184,0.05);
          border-bottom: 1px solid rgba(0,230,184,0.15);
        }
        .fn-balance-item { display: inline-flex; align-items: center; gap: 8px; color: #94a3b8; }
        .fn-balance-item strong, .icon-gems { color: #00e6b8; }
        .fn-notice-banner {
          background: rgba(68,255,136,0.12);
          border-bottom: 1px solid rgba(68,255,136,0.3);
          color: #44ff88;
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
          border-bottom: 1px solid rgba(255,255,255,0.08);
          overflow-x: auto;
        }
        .tab-btn {
          background: transparent;
          border: 0;
          border-bottom: 2px solid transparent;
          color: #94a3b8;
          padding: 10px 14px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }
        .tab-btn:hover, .tab-btn.active { color: #00e6b8; }
        .tab-btn.active { border-bottom-color: #00e6b8; }
        .fn-shop-content { padding: 24px; overflow-y: auto; flex: 1; }
        .billing-toggle {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 18px;
          color: #ffaa00;
          font-weight: 800;
        }
        .fn-tier-grid, .fn-cards-grid, .fn-items-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }
        .fn-shop-card, .item-box, .reward-stat, .streak-progress, .transaction-list {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
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
          border-color: rgba(0,230,184,0.38);
          box-shadow: 0 14px 30px rgba(0,0,0,0.32);
        }
        .tier-card.artist { border-color: rgba(0,230,184,0.35); }
        .tier-card.vip {
          border-color: rgba(255,170,0,0.4);
          overflow: hidden;
        }
        .tier-card.vip::before {
          pointer-events: none;
          content: '';
          position: absolute;
          inset: -40%;
          background-image: radial-gradient(circle, rgba(255,170,0,0.35) 0 1px, transparent 2px);
          background-size: 22px 22px;
          animation: shimmer-drift 9s linear infinite;
          opacity: 0.55;
        }
        .card-icon { color: #00e6b8; margin: 8px 0; position: relative; }
        .tier-card.vip .card-icon, .bundle-gem { color: #ffaa00; }
        .fn-shop-card h4, .item-box h4, .transaction-list h4 { margin: 6px 0; color: #e2e8f0; font-size: 1.05rem; }
        .tier-price, .gem-amount { color: #00e6b8; font-size: 1.32rem; font-weight: 900; }
        .fn-shop-card p, .item-box p, .item-box small { color: #94a3b8; font-size: 0.8rem; line-height: 1.45; }
        .fn-shop-card ul { list-style: none; padding: 0; margin: 12px 0 16px; width: 100%; text-align: left; }
        .fn-shop-card li { display: flex; gap: 8px; align-items: center; margin: 7px 0; color: #cbd5e1; font-size: 0.78rem; }
        .fn-shop-card li svg { color: #44ff88; flex: 0 0 auto; }
        .card-badge {
          position: absolute;
          top: 6px;
          z-index: 2;
          background: #3388ff;
          color: #fff;
          font-size: 0.68rem;
          font-weight: 900;
          padding: 3px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.25);
        }
        .card-badge.hot { background: #ff44cc; }
        .card-badge.gold { background: #ffaa00; color: #0d0e17; }
        .card-badge.pulse { animation: badge-pulse 1.8s ease-in-out infinite; }
        .buy-btn, .buy-btn-sm {
          width: 100%;
          margin-top: auto;
          background: #00e6b8;
          color: #03110e;
          border: 0;
          padding: 10px;
          border-radius: 6px;
          font-weight: 900;
          cursor: pointer;
        }
        .buy-btn:hover:not(:disabled), .buy-btn-sm:hover:not(:disabled) { filter: brightness(1.12); }
        .buy-btn:disabled, .buy-btn-sm:disabled {
          background: rgba(255,255,255,0.08);
          color: #64748b;
          cursor: not-allowed;
        }
        .feature-table {
          width: 100%;
          margin-top: 18px;
          border-collapse: collapse;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          overflow: hidden;
        }
        .feature-table th, .feature-table td {
          padding: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          color: #cbd5e1;
          font-size: 0.78rem;
          text-align: left;
        }
        .feature-table th { color: #00e6b8; background: rgba(0,230,184,0.06); }
        .bundle-card.locked { opacity: 0.55; }
        .lock-mark { position: absolute; right: 14px; top: 14px; color: #ffaa00; }
        .item-box { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
        .item-icon { color: #00e6b8; }
        .item-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .owned-badge {
          color: #04130a;
          background: #44ff88;
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
        .reward-stat { padding: 18px; display: flex; flex-direction: column; gap: 6px; color: #00e6b8; }
        .reward-stat span { color: #e2e8f0; font-size: 1.45rem; font-weight: 900; }
        .reward-stat small, .streak-progress span, .transaction-list p { color: #94a3b8; }
        .hero-stat { border-color: rgba(0,230,184,0.3); }
        .streak-progress, .transaction-list { padding: 16px; grid-column: 1 / -1; }
        .streak-progress > div:first-child { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
        .progress-track { height: 9px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; }
        .progress-track div { height: 100%; background: linear-gradient(90deg, #00e6b8, #ffaa00); }
        .transaction-list p { margin: 8px 0 0; font-size: 0.82rem; }
        .fn-shop-footer {
          padding: 12px 24px;
          background: rgba(0,0,0,0.38);
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .fn-shop-footer p { margin: 3px 0; color: #64748b; font-size: 0.74rem; text-align: center; }
        @keyframes fn-modal-enter {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes shop-aurora {
          0%, 100% { background-position: 0% 50%; filter: hue-rotate(0deg); }
          50% { background-position: 100% 50%; filter: hue-rotate(25deg); }
        }
        @keyframes shimmer-drift {
          from { transform: translate3d(-20px, -20px, 0); }
          to { transform: translate3d(20px, 20px, 0); }
        }
        @keyframes badge-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(255,170,0,0); }
          50% { box-shadow: 0 0 18px rgba(255,170,0,0.55); }
        }
        @media (max-width: 720px) {
          .fn-shop-modal { max-height: 96vh; }
          .feature-table { min-width: 620px; }
          .fn-shop-content { overflow-x: auto; }
        }
      `}</style>
    </div>
  );
}
