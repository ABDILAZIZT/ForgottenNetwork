import { useEffect, useState } from 'react';
import {
  MARKET_ITEMS,
  COIN_PACKS,
  CREATOR_BUNDLES,
  purchaseMarketItem,
  readMarket,
  topUpMarketDemo,
  type MarketCategory,
  type MarketItem,
} from '../economy';
import CreativeStudio from './CreativeStudio';

export default function MarketCatalog() {
  const [category, setCategory] = useState<MarketCategory | 'Bundles'>('Tools');
  const [ledger, setLedger] = useState(readMarket);
  const [pending, setPending] = useState<MarketItem | null>(null);
  const [notice, setNotice] = useState('');
  const [celebrate, setCelebrate] = useState(false);
  const [studio, setStudio] = useState(false);
  useEffect(() => {
    const refresh = () => setLedger(readMarket());
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(false), 1800);
    return () => clearTimeout(timer);
  }, [celebrate]);
  const refresh = () => {
    setLedger(readMarket());
    window.dispatchEvent(new Event('fn-market-change'));
  };
  return (
    <section className="fn-market" aria-label="Creator collection">
      <div className="fn-market-feature">
        <span>THE CREATOR COLLECTION / 01</span>
        <h2>
          A little color.
          <br />
          <em>A world of possibility.</em>
        </h2>
        <p>Collect tools. Make something unmistakably yours.</p>
        <div className="fn-market-balance">
          <strong>{ledger.coins.toLocaleString()} demo coins</strong>
          <button
            onClick={() => {
              try {
                topUpMarketDemo();
                refresh();
                setNotice('Added 1500 free demo coins.');
              } catch {
                setNotice('Could not save demo coins.');
              }
            }}
          >
            Add free demo coins
          </button>
        </div>
        <small>
          Separate Studio demo wallet. No cash value. Purchases and effects stay on this device.
        </small>
      </div>
      <div className="fn-market-filters" aria-label="Collection categories">
        {(['Tools', 'Effects', 'Premium', 'Bundles'] as const).map((label, i) => (
          <button
            key={label}
            aria-pressed={category === label}
            onClick={() => {
              setCategory(label);
              setPending(null);
            }}
          >
            {['🎨', '✨', '👑', '🎁'][i]} {label}
          </button>
        ))}
        <button onClick={() => setStudio(!studio)} aria-expanded={studio}>
          Open Studio
        </button>
      </div>
      {studio && <CreativeStudio owned={ledger.owned} />}
      {pending && (
        <div className="fn-purchase-confirm" role="group" aria-label="Confirm purchase">
          <strong>
            {pending.name} · {pending.cost} demo coins
          </strong>
          <p>{pending.description}</p>
          <button
            onClick={() => {
              const result = purchaseMarketItem(pending.id);
              setNotice(
                result === 'Purchased'
                  ? `Just purchased: ${pending.name}. Open Studio for tools; effects are in Expedition preferences.`
                  : result,
              );
              setCelebrate(result === 'Purchased');
              setPending(null);
              refresh();
            }}
          >
            Confirm purchase
          </button>
          <button onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}
      <p role="status" className="fn-market-notice">
        {notice}
      </p>
      {celebrate && (
        <div className="fn-market-confetti" aria-hidden="true">
          ✦ · ✧ · ✦ · ✧ · ✦ · ✧ · ✦
        </div>
      )}
      <div className="fn-market-grid">
        {category !== 'Bundles' ? (
          MARKET_ITEMS.filter((item) => item.category === category).map((item) => (
            <article className={`fn-market-card ${item.rarity}`} key={item.id}>
              <span className="fn-rarity">
                {item.rarity} / {ledger.owned.includes(item.id) ? 'OWNED' : 'NEW'}
              </span>
              <div className={`fn-item-art ${item.id}`} aria-hidden="true">
                {item.category === 'Tools' ? '✎' : item.category === 'Effects' ? '✧' : '♔'}
              </div>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <strong>
                {item.cost} coins <small> / {item.price} planned</small>
              </strong>
              <button
                disabled={
                  item.previewOnly || ledger.owned.includes(item.id) || ledger.coins < item.cost
                }
                onClick={() => setPending(item)}
              >
                {item.previewOnly
                  ? 'Feature coming soon'
                  : ledger.owned.includes(item.id)
                    ? 'Owned'
                    : ledger.coins < item.cost
                      ? 'Not enough coins'
                      : 'Buy with demo coins'}
              </button>
              <button disabled>Coming soon — Pay with Card</button>
            </article>
          ))
        ) : (
          <>
            {CREATOR_BUNDLES.map((bundle) => (
              <article className="fn-market-card legendary" key={bundle.name}>
                <span className="fn-rarity">BUNDLE / PREVIEW</span>
                <h3>{bundle.name}</h3>
                <p>{bundle.description}</p>
                <strong>{bundle.price}</strong>
                <button disabled>Coming soon — Pay with Card</button>
              </article>
            ))}
            {COIN_PACKS.map((pack) => (
              <article className="fn-market-card rare" key={pack.coins}>
                <span className="fn-rarity">
                  {pack.coins === 5000 ? 'BEST VALUE / PLANNED PRICE' : 'COIN PACK / PREVIEW'}
                </span>
                <h3>{pack.coins} coins</h3>
                <strong>{pack.price}</strong>
                <button disabled>Coming soon — Pay with Card</button>
              </article>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
