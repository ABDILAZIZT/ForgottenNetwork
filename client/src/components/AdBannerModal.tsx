import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Coins, Play, Sparkles, Tv, X } from 'lucide-react';
import type { SubscriptionTier } from './SubscriptionBadge';
import { dailyCount, readNumber } from '../economy';
import { useModal } from './useModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdWatched: (gems: number, watchedToday: number) => void;
  subscriptionTier: SubscriptionTier;
  adsWatchedToday: number;
}

const adDuration = 15;
const cooldownMs = 3 * 60 * 1000;
const maxAds = 3;

function formatCooldown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function AdBannerModal({
  isOpen,
  onClose,
  onAdWatched,
  subscriptionTier,
  adsWatchedToday,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(adDuration);
  const [completed, setCompleted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const callback = useRef(onAdWatched);
  callback.current = onAdWatched;
  const modalRef = useModal(isOpen && subscriptionTier !== 'vip', onClose);

  useEffect(() => {
    setIsPlaying(false);
    setCompleted(false);
    setSecondsLeft(adDuration);
    setNow(Date.now());
  }, [isOpen, subscriptionTier]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isPlaying || !isOpen || subscriptionTier === 'vip') return;
    let remainingMs = adDuration * 1000;
    let previous = Date.now();
    setSecondsLeft(adDuration);
    const timer = window.setInterval(() => {
      const current = Date.now();
      if (!document.hidden) remainingMs -= Math.min(500, current - previous);
      previous = current;
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setSecondsLeft(remainingSeconds);
      if (remainingSeconds === 0) {
        window.clearInterval(timer);
        setIsPlaying(false);
        setCompleted(true);
        callback.current(20, dailyCount('fn_ads_today', 'fn_ads_last_date') + 1);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [isOpen, isPlaying, subscriptionTier]);

  const remaining = Math.max(0, maxAds - adsWatchedToday);
  const lastAdTime = readNumber('fn_last_ad_time');
  const cooldownRemaining = Math.max(0, cooldownMs - (now - lastAdTime));
  const isCoolingDown = cooldownRemaining > 0 && !completed;
  const atLimit = remaining <= 0;
  const ringProgress = useMemo(
    () => ((adDuration - secondsLeft) / adDuration) * 100,
    [secondsLeft],
  );

  if (!isOpen || subscriptionTier === 'vip') return null;

  const startAd = () => {
    if (
      Date.now() - readNumber('fn_last_ad_time') < cooldownMs ||
      dailyCount('fn_ads_today', 'fn_ads_last_date') >= maxAds
    )
      return;
    setCompleted(false);
    setIsPlaying(true);
  };

  return (
    <div className="fn-ad-overlay">
      <div
        className="fn-ad-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sponsor Screen"
        tabIndex={-1}
      >
        {completed && (
          <div className="gem-rain">
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i}>💎</span>
            ))}
          </div>
        )}
        <button className="fn-close-btn" onClick={onClose} title="Close">
          <X size={20} />
        </button>

        <div className="fn-ad-header">
          <Tv size={28} className="ad-icon" />
          <div>
            <h3>Sponsor Screen</h3>
            <p>Demo sponsor preview. Complete 15 seconds to earn 20 demo gems.</p>
          </div>
        </div>

        <div className="ad-preview-screen">
          <div className="scanlines" />
          {isPlaying ? (
            <div className="ad-playing-container">
              <svg className="countdown-ring" width="118" height="118" viewBox="0 0 118 118">
                <circle cx="59" cy="59" r="50" className="ring-bg" />
                <circle
                  cx="59"
                  cy="59"
                  r="50"
                  className="ring-progress"
                  style={{ strokeDashoffset: 314 - (314 * ringProgress) / 100 }}
                />
              </svg>
              <strong>{secondsLeft}</strong>
              <span>broadcast seconds remaining</span>
            </div>
          ) : completed ? (
            <div className="ad-completed">
              <Check size={48} className="check-icon" />
              <h4>Signal complete</h4>
              <p>+20 gems added to your account.</p>
            </div>
          ) : (
            <div className="ad-placeholder">
              <Sparkles size={42} className="pulse-sparkle" />
              <span>Forgotten Network sponsor relay</span>
              <p>
                {remaining} of {maxAds} ads remaining today
              </p>
            </div>
          )}
        </div>

        {!isPlaying && !completed && (
          <button className="watch-ad-btn" onClick={startAd} disabled={isCoolingDown || atLimit}>
            <Play size={18} />
            {atLimit
              ? 'Daily ad limit reached'
              : isCoolingDown
                ? `Cooldown ${formatCooldown(cooldownRemaining)}`
                : 'Play demo sponsor (+20 demo gems)'}
          </button>
        )}

        {completed && (
          <button className="watch-ad-btn done-btn" onClick={onClose}>
            <Coins size={18} /> Continue exploring
          </button>
        )}

        <div className="ad-footer-note">
          {remaining} of {maxAds} ads remaining today
        </div>
      </div>

      <style>{`
        .fn-ad-overlay {
          position: fixed;
          inset: 0;
          background: rgba(5,5,12,0.85);
          backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          direction: ltr;
          font-family: 'Outfit', system-ui, sans-serif;
        }
        .fn-ad-modal {
          position: relative;
          width: min(500px, 100%);
          padding: 24px;
          background: #0d0e17;
          border: 1px solid rgba(51,136,255,0.3);
          border-radius: 8px;
          box-shadow: 0 0 35px rgba(51,136,255,0.15), 0 20px 50px rgba(0,0,0,0.8);
          color: #e2e8f0;
          overflow: hidden;
          animation: fn-modal-enter 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .fn-close-btn {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 3;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          color: #94a3b8;
          cursor: pointer;
          border-radius: 6px;
          padding: 6px;
        }
        .fn-ad-header { display: flex; gap: 12px; align-items: flex-start; margin: 4px 32px 16px 0; }
        .ad-icon { color: #3388ff; filter: drop-shadow(0 0 10px rgba(51,136,255,0.5)); }
        .fn-ad-header h3 { margin: 0 0 4px; font-size: 1.25rem; font-weight: 900; }
        .fn-ad-header p { margin: 0; color: #94a3b8; font-size: 0.82rem; line-height: 1.4; }
        .ad-preview-screen {
          position: relative;
          min-height: 230px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          margin-bottom: 16px;
          overflow: hidden;
          border-radius: 8px;
          border: 1px solid rgba(0,230,184,0.28);
          background:
            radial-gradient(circle at 30% 20%, rgba(0,230,184,0.14), transparent 34%),
            linear-gradient(135deg, rgba(51,136,255,0.12), rgba(255,68,204,0.08)),
            #05070d;
          box-shadow: inset 0 0 35px rgba(0,230,184,0.12), 0 0 18px rgba(51,136,255,0.18);
        }
        .scanlines {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(180deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 4px);
          mix-blend-mode: screen;
          opacity: 0.45;
          pointer-events: none;
        }
        .ad-placeholder, .ad-completed, .ad-playing-container {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          text-align: center;
          z-index: 1;
        }
        .pulse-sparkle { color: #00e6b8; animation: spin-pulse 2s linear infinite; }
        .ad-placeholder span, .ad-playing-container span { color: #94a3b8; font-size: 0.78rem; }
        .ad-placeholder p { color: #00e6b8; margin: 0; font-weight: 900; }
        .countdown-ring { transform: rotate(-90deg); filter: drop-shadow(0 0 12px rgba(0,230,184,0.35)); }
        .ring-bg, .ring-progress { fill: none; stroke-width: 8; }
        .ring-bg { stroke: rgba(255,255,255,0.08); }
        .ring-progress {
          stroke: #00e6b8;
          stroke-linecap: round;
          stroke-dasharray: 314;
          transition: stroke-dashoffset 1s linear;
        }
        .ad-playing-container strong {
          position: absolute;
          top: 43px;
          font-size: 2rem;
          color: #e2e8f0;
        }
        .check-icon { color: #44ff88; }
        .ad-completed h4 { margin: 0; font-size: 1.2rem; }
        .ad-completed p { margin: 0; color: #44ff88; }
        .watch-ad-btn {
          width: 100%;
          background: #3388ff;
          color: #fff;
          border: 0;
          padding: 12px;
          border-radius: 6px;
          font-weight: 900;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .watch-ad-btn:disabled {
          background: rgba(255,255,255,0.08);
          color: #64748b;
          cursor: not-allowed;
        }
        .watch-ad-btn.done-btn { background: #00e6b8; color: #03110e; }
        .ad-footer-note { margin-top: 12px; color: #64748b; text-align: center; font-size: 0.76rem; }
        .gem-rain { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
        .gem-rain span {
          position: absolute;
          top: -30px;
          animation: gem-fall 1.5s ease-in forwards;
        }
        .gem-rain span:nth-child(1) { left: 5%; animation-delay: 0ms; }
        .gem-rain span:nth-child(2) { left: 12%; animation-delay: 80ms; }
        .gem-rain span:nth-child(3) { left: 18%; animation-delay: 160ms; }
        .gem-rain span:nth-child(4) { left: 24%; animation-delay: 40ms; }
        .gem-rain span:nth-child(5) { left: 31%; animation-delay: 130ms; }
        .gem-rain span:nth-child(6) { left: 39%; animation-delay: 210ms; }
        .gem-rain span:nth-child(7) { left: 46%; animation-delay: 70ms; }
        .gem-rain span:nth-child(8) { left: 53%; animation-delay: 180ms; }
        .gem-rain span:nth-child(9) { left: 61%; animation-delay: 30ms; }
        .gem-rain span:nth-child(10) { left: 68%; animation-delay: 120ms; }
        .gem-rain span:nth-child(11) { left: 75%; animation-delay: 220ms; }
        .gem-rain span:nth-child(12) { left: 82%; animation-delay: 90ms; }
        .gem-rain span:nth-child(13) { left: 88%; animation-delay: 170ms; }
        .gem-rain span:nth-child(14) { left: 94%; animation-delay: 260ms; }
        .gem-rain span:nth-child(15) { left: 28%; animation-delay: 280ms; }
        .gem-rain span:nth-child(16) { left: 57%; animation-delay: 320ms; }
        .gem-rain span:nth-child(17) { left: 72%; animation-delay: 360ms; }
        .gem-rain span:nth-child(18) { left: 43%; animation-delay: 400ms; }
        @keyframes fn-modal-enter {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes spin-pulse {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.16); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes gem-fall {
          from { transform: translateY(0) rotate(0deg); opacity: 1; }
          to { transform: translateY(460px) rotate(220deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
