import { useEffect, useRef, useState } from 'react';
import { Compass, X } from 'lucide-react';
import { readExploration, recordExploration } from '../exploration';
import { explorationGemReward, grantExplorationGems, readMarket, readTier } from '../economy';
import { recordDailyChallengeExplore } from '../challenges';
import { useModal } from './useModal';
import MarketCatalog from './MarketCatalog';
import AdSlot from './AdSlot';
import { useReducedMotion } from './useReducedMotion';
import { usePageVisible } from './usePageVisible';
import { locationUrl } from '../location';
import { useShareLink } from './ShareNotice';
import { translate, useLocale } from '../locale';
import WeatherCanvas from './WeatherCanvas';

export default function Expedition({
  x,
  y,
  zoom,
  reducedMotion,
  onDiscover,
  onVisit,
  hidden = false,
}: {
  x: number;
  y: number;
  zoom: number;
  reducedMotion: boolean;
  onDiscover: () => void;
  onVisit: (x: number, y: number) => void;
  hidden?: boolean;
}) {
  const locale = useLocale();
  const visible = usePageVisible();
  const motion = !useReducedMotion(reducedMotion) && visible && !hidden;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('journey');
  const [progress, setProgress] = useState(readExploration);
  const [owned, setOwned] = useState(() => readMarket().owned);
  const [tier] = useState(readTier);
  const [weather, setWeather] = useState('off');
  const [cycle, setCycle] = useState(false);
  const [scanlines, setScanlines] = useState(false);
  const [effects, setEffects] = useState(false);
  const [haptics, setHaptics] = useState(false);
  const { share, notice } = useShareLink();
  const [time, setTime] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const aura = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const modal = useModal(open && !hidden, () => setOpen(false));
  const region = `${Math.floor(x / 512)},${Math.floor(y / 512)}`;
  useEffect(() => {
    if (!hidden) {
      recordExploration(x, y);
      if (recordDailyChallengeExplore(region)) grantExplorationGems(explorationGemReward());
    }
  }, [region, hidden]);
  useEffect(() => {
    const refresh = () => setProgress(readExploration());
    const market = () => setOwned(readMarket().owned);
    const network = () => setOnline(navigator.onLine);
    window.addEventListener('fn-exploration-change', refresh);
    window.addEventListener('fn-market-change', market);
    window.addEventListener('storage', refresh);
    window.addEventListener('storage', market);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    return () => {
      window.removeEventListener('fn-exploration-change', refresh);
      window.removeEventListener('fn-market-change', market);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('storage', market);
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
    };
  }, []);
  useEffect(() => {
    if (!visible || hidden || (!cycle && !(open && tab === 'atmosphere'))) return;
    setTime(Date.now());
    const timer = setInterval(() => setTime(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [visible, hidden, cycle, open, tab]);
  useEffect(() => {
    document.body.dataset.cosmetics = effects && !hidden ? owned.join(' ') : '';
    return () => {
      delete document.body.dataset.cosmetics;
    };
  }, [effects, owned, hidden]);
  useEffect(() => {
    if (!effects || !motion || !owned.some((id) => ['neon_aura', 'particle_trail'].includes(id)))
      return;
    let last = 0,
      frame = 0;
    let position: { x: number; y: number } | null = null;
    const container = trail.current;
    const paint = () => {
      frame = 0;
      if (!position || document.hidden) return;
      const { x, y } = position;
      if (aura.current) aura.current.style.transform = `translate(${x}px, ${y}px)`;
      if (
        owned.includes('particle_trail') &&
        container &&
        performance.now() - last > 70 &&
        container.childElementCount < 16
      ) {
        last = performance.now();
        const spark = document.createElement('i');
        spark.style.setProperty('--trail-x', x + 'px');
        spark.style.setProperty('--trail-y', y + 'px');
        spark.textContent = '✧';
        spark.onanimationend = () => spark.remove();
        container.append(spark);
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || document.hidden) return;
      position = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
      container?.replaceChildren();
    };
  }, [effects, owned, motion]);
  const night = new Date(time).getHours() < 7 || new Date(time).getHours() >= 19;
  const active = progress.activity.filter((entry) => time - entry.at < 120000).length;
  return (
    <>
      {!hidden && (
        <button
          className="fn-expedition-launch"
          onClick={() => setOpen(true)}
          aria-label="Open Expedition and Creator Market"
        >
          <Compass size={17} />
          <span>{translate('expedition.launch', locale)}</span>
        </button>
      )}
      {!hidden && !online && (
        <div className="fn-offline" role="status">
          {translate('expedition.offline', locale)}
        </div>
      )}
      {notice}
      {!hidden && (weather !== 'off' || scanlines || cycle) && (
        <div
          aria-hidden="true"
          className={`fn-weather ${!motion ? 'still' : ''} ${weather} ${scanlines ? 'crt' : ''} ${cycle ? (night ? 'night' : 'day') : ''}`}
        >
          {motion && weather !== 'off' && <WeatherCanvas weather={weather} />}
        </div>
      )}
      {effects && motion && (
        <>
          <div
            ref={aura}
            className={owned.includes('neon_aura') ? 'fn-pointer-aura' : 'fn-hidden'}
            aria-hidden="true"
          />
          <div ref={trail} className="fn-pointer-trail" aria-hidden="true" />
        </>
      )}
      {open && !hidden && (
        <div className="fn-expedition-backdrop">
          <div
            ref={modal}
            className="fn-expedition-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Expedition"
            tabIndex={-1}
          >
            <header>
              <div>
                <span className="fn-eyebrow">FIELD NOTES / FORGOTTEN NETWORK</span>
                <h2>{owned.includes('vip_badge') && effects ? '♛ ' : ''}Your expedition</h2>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close Expedition">
                <X size={22} />
              </button>
            </header>
            <nav aria-label="Expedition sections">
              {['journey', 'market', 'atmosphere'].map((t) => (
                <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </nav>
            <div className="fn-expedition-scroll">
              {tab === 'market' ? (
                <MarketCatalog showAds={tier !== 'vip'} position={{ x, y }} />
              ) : tab === 'atmosphere' ? (
                <section className="fn-preferences">
                  <h3>Set the atmosphere</h3>
                  <p>
                    Journey activity: {active > 4 ? 'Electric' : active ? 'Awakening' : 'Quiet'} ·{' '}
                    {night ? 'Night' : 'Day'}
                  </p>
                  <label>
                    Weather{' '}
                    <select value={weather} onChange={(e) => setWeather(e.target.value)}>
                      <option value="off">Off</option>
                      <option value="particles">Floating particles</option>
                      <option value="rain">Digital rain</option>
                      <option value="snow">Pixel snow</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={cycle}
                      onChange={(e) => setCycle(e.target.checked)}
                    />{' '}
                    Day / night atmosphere (device time)
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={scanlines}
                      onChange={(e) => setScanlines(e.target.checked)}
                    />{' '}
                    Subtle CRT scanlines
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={effects}
                      onChange={(e) => setEffects(e.target.checked)}
                    />{' '}
                    Enable owned cosmetic effects
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={haptics}
                      onChange={(e) => setHaptics(e.target.checked)}
                    />{' '}
                    Gentle haptic feedback where supported
                  </label>
                  <p>
                    Motion follows your canvas accessibility setting. All atmosphere controls are
                    optional.
                  </p>
                </section>
              ) : (
                <section className="fn-journey">
                  <div className="fn-journey-hero">
                    <span>EVERY EXPLORER LEAVES A TRACE</span>
                    <h3>Where next?</h3>
                    <p>
                      {progress.pixels.toLocaleString()} pixels recorded · {progress.places.length}{' '}
                      neighborhoods visited
                    </p>
                    <small>
                      Device progress. Permanent mode counts accepted owned area; Classic counts
                      changed painted pixels.
                    </small>
                  </div>
                  <div className="fn-journey-actions">
                    <button
                      onClick={() => {
                        onDiscover();
                        setOpen(false);
                        if (haptics) navigator.vibrate?.(10);
                      }}
                    >
                      Discover somewhere new ↗
                    </button>
                    <button
                      onClick={() =>
                        void share(
                          locationUrl(
                            location.origin,
                            location.pathname + location.search,
                            x,
                            y,
                            zoom,
                            undefined,
                            null,
                          ),
                        )
                      }
                    >
                      {translate('expedition.shareLocation', locale)}
                    </button>
                  </div>
                  <div className="fn-achievements">
                    {['First Steps', 'Night Owl', '100 Pixels', 'Explorer', 'Cartographer'].map(
                      (b) => (
                        <span key={b} className={progress.badges.includes(b) ? 'earned' : ''}>
                          {progress.badges.includes(b) ? '✦' : '◇'} {b}
                        </span>
                      ),
                    )}
                  </div>
                  <h3>Signals from your journey</h3>
                  <p>Recent local actions and live marks seen in this session.</p>
                  <div className="fn-activity">
                    {progress.activity.length ? (
                      progress.activity
                        .slice()
                        .reverse()
                        .map((a) => (
                          <button
                            key={a.id}
                            onClick={() => {
                              onVisit(a.x, a.y);
                              setOpen(false);
                            }}
                          >
                            <span>{a.text}</span>
                            <small>
                              {new Date(a.at).toLocaleTimeString()} · {Math.round(a.x)},{' '}
                              {Math.round(a.y)} ↗
                            </small>
                          </button>
                        ))
                    ) : (
                      <p>No marks recorded yet. Explore and draw to start your story.</p>
                    )}
                  </div>
                  {tier !== 'vip' && (
                    <AdSlot slotId="ad-slot-footer" size="banner" position="journey-footer" />
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
