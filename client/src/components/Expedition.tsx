import { useEffect, useRef, useState } from 'react';
import { Compass, X } from 'lucide-react';
import { readExploration, recordExploration } from '../exploration';
import { readMarket } from '../economy';
import { useModal } from './useModal';
import MarketCatalog from './MarketCatalog';
import AdSlot from './AdSlot';

export default function Expedition({
  x,
  y,
  reducedMotion,
  onDiscover,
  onVisit,
  onDraw,
  onRefresh,
  hidden = false,
}: {
  x: number;
  y: number;
  reducedMotion: boolean;
  onDiscover: () => void;
  onVisit: (x: number, y: number) => void;
  onDraw: () => void;
  onRefresh: () => void;
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('journey');
  const [progress, setProgress] = useState(readExploration);
  const [owned, setOwned] = useState(() => readMarket().owned);
  const [weather, setWeather] = useState('off');
  const [cycle, setCycle] = useState(false);
  const [scanlines, setScanlines] = useState(false);
  const [effects, setEffects] = useState(false);
  const [haptics, setHaptics] = useState(false);
  const [notice, setNotice] = useState('');
  const [time, setTime] = useState(Date.now());
  const [tutorial, setTutorial] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const aura = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const tutorialPixels = useRef(0);
  const modal = useModal(open && !hidden, () => setOpen(false));
  const region = `${Math.floor(x / 512)},${Math.floor(y / 512)}`;
  useEffect(() => {
    if (!hidden) recordExploration(x, y);
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
    const timer = setInterval(() => setTime(Date.now()), 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('fn-exploration-change', refresh);
      window.removeEventListener('fn-market-change', market);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('storage', market);
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
    };
  }, []);
  useEffect(() => {
    if (tutorial && progress.pixels > tutorialPixels.current) {
      setTutorial(false);
      setNotice('First mark complete! Your journey has begun.');
      if (haptics) navigator.vibrate?.(15);
    }
  }, [progress.pixels, tutorial, haptics]);
  useEffect(() => {
    document.body.dataset.cosmetics = effects ? owned.join(' ') : '';
    return () => {
      delete document.body.dataset.cosmetics;
    };
  }, [effects, owned]);
  useEffect(() => {
    if (!effects || reducedMotion) return;
    let last = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (aura.current) aura.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      if (
        owned.includes('particle_trail') &&
        trail.current &&
        performance.now() - last > 70 &&
        trail.current.childElementCount < 16
      ) {
        last = performance.now();
        const spark = document.createElement('i');
        spark.style.left = e.clientX + 'px';
        spark.style.top = e.clientY + 'px';
        spark.textContent = '✧';
        spark.onanimationend = () => spark.remove();
        trail.current.append(spark);
      }
    };
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      trail.current?.replaceChildren();
    };
  }, [effects, owned, reducedMotion]);
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
          <span>Expedition</span>
        </button>
      )}
      {!hidden && !online && (
        <div className="fn-offline" role="status">
          Offline · live canvas unavailable. Unsent marks stay on this device.
        </div>
      )}
      {!hidden && tutorial && (
        <div className="fn-tutorial" role="status">
          <strong>Your first mark</strong>
          <p>
            1. Choose your identity if asked.
            <br />
            2. Pick a color, then click or drag in free space.
            <br />
            3. Wait for the saved confirmation.
          </p>
          <button onClick={() => setTutorial(false)}>Dismiss tutorial</button>
        </div>
      )}
      {!hidden && notice && !open && (
        <button className="fn-expedition-notice" onClick={() => setNotice('')}>
          {notice} · Dismiss
        </button>
      )}
      <div
        aria-hidden="true"
        className={`fn-weather ${reducedMotion ? 'still' : ''} ${weather} ${scanlines ? 'crt' : ''} ${cycle ? (night ? 'night' : 'day') : ''}`}
      >
        {!reducedMotion &&
          weather !== 'off' &&
          Array.from({ length: 28 }, (_, i) => (
            <i
              key={i}
              style={{
                left: ((i * 37) % 100) + '%',
                animationDelay: -(i % 9) + 's',
                animationDuration: (weather === 'rain' ? 2 : 8) + (i % 4) + 's',
              }}
            />
          ))}
      </div>
      {effects && !reducedMotion && (
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
            <div
              className="fn-expedition-scroll"
              onTouchStart={(e) => {
                touch.current =
                  e.currentTarget.scrollTop === 0 && e.touches.length === 1
                    ? e.touches[0].clientY
                    : null;
              }}
              onTouchEnd={(e) => {
                if (touch.current !== null && e.changedTouches[0].clientY - touch.current > 100) {
                  onRefresh();
                  setNotice('Refresh requested.');
                }
                touch.current = null;
              }}
            >
              {tab === 'market' ? (
                <MarketCatalog />
              ) : tab === 'atmosphere' ? (
                <section className="fn-preferences">
                  <h3>Set the atmosphere</h3>
                  <p>
                    Network mood: {active > 4 ? 'Electric' : active ? 'Awakening' : 'Quiet'} ·{' '}
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
                  <button
                    onClick={() => setNotice('Secret signal found: the network remembers you. ✦')}
                  >
                    Tune frequency 796
                  </button>
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
                      onClick={() => {
                        tutorialPixels.current = progress.pixels;
                        setTutorial(true);
                        setOpen(false);
                        onDraw();
                      }}
                    >
                      Draw your first pixel
                    </button>
                    <button
                      onClick={() => {
                        const url = new URL(location.href);
                        url.searchParams.set('x', String(Math.round(x)));
                        url.searchParams.set('y', String(Math.round(y)));
                        void navigator.clipboard.writeText(url.toString()).then(
                          () => setNotice('Location copied.'),
                          () => setNotice('Copy unavailable. Use the browser address bar.'),
                        );
                      }}
                    >
                      Share location
                    </button>
                    <button
                      onClick={() => {
                        onRefresh();
                        setNotice('Refresh requested.');
                      }}
                    >
                      Refresh activity
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
                  <p>
                    Recent local actions and live marks seen in this session. Pull down here on
                    mobile to refresh.
                  </p>
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
                  <AdSlot slotId="expedition-sponsor" size="banner" position="journey-footer" />
                </section>
              )}
              <p role="status">{notice}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
