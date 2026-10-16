import { useEffect, useRef, useState } from 'react';
import { Check, Coins, Gift, Sparkles, X } from 'lucide-react';
import type { SubscriptionTier } from './SubscriptionBadge';
import { effectiveStreak } from '../economy';
import { useModal } from './useModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onClaimReward: (gems: number) => void;
  alreadyClaimed: boolean;
  subscriptionTier: SubscriptionTier;
  streakCount: number;
}

const rewards = [
  { day: 1, gems: 40 },
  { day: 2, gems: 45 },
  { day: 3, gems: 50, label: 'Streak Bonus!' },
  { day: 4, gems: 45 },
  { day: 5, gems: 55 },
  { day: 6, gems: 60 },
  { day: 7, gems: 100, label: 'Weekly Champion!' },
];

export default function DailyRewardModal({
  isOpen,
  onClose,
  onClaimReward,
  alreadyClaimed,
  subscriptionTier,
  streakCount,
}: Props) {
  const [claiming, setClaiming] = useState(false);
  const claimTimer = useRef<ReturnType<typeof setTimeout>>();
  const claimCallback = useRef(onClaimReward);
  claimCallback.current = onClaimReward;
  const modalRef = useModal(isOpen, onClose);
  const streak = effectiveStreak();
  const nextDay = alreadyClaimed ? ((Math.max(1, streakCount) - 1) % 7) + 1 : (streak % 7) + 1;
  const reward = rewards[nextDay - 1];
  const multiplier = subscriptionTier === 'vip' ? 2 : 1;
  const rewardAmount = reward.gems * multiplier;

  useEffect(() => {
    setClaiming(false);
    return () => clearTimeout(claimTimer.current);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClaim = () => {
    if (alreadyClaimed || claiming) return;
    setClaiming(true);
    claimTimer.current = setTimeout(() => {
      claimCallback.current(rewardAmount);
      setClaiming(false);
    }, 900);
  };

  return (
    <div className="fn-reward-overlay">
      <div
        className="fn-reward-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Daily Signal Cache"
        tabIndex={-1}
      >
        <div className="pixel-particles" />
        <button className="fn-close-btn" onClick={onClose} title="Close">
          <X size={20} />
        </button>

        <div className={`fn-reward-icon-wrapper ${claiming ? 'opening' : ''}`}>
          <Gift size={58} className="reward-gift-icon" />
          <Sparkles size={28} className="sparkle-1" />
          <Sparkles size={22} className="sparkle-2" />
        </div>

        <h3>Daily Signal Cache</h3>
        <p>Don't lose your streak! Come back tomorrow.</p>

        <div className="streak-calendar">
          {rewards.map((item) => {
            const claimed = item.day < nextDay || (alreadyClaimed && item.day === nextDay);
            const today = item.day === nextDay && !alreadyClaimed;
            return (
              <div
                key={item.day}
                className={`streak-cell ${claimed ? 'claimed' : ''} ${today ? 'today' : ''}`}
              >
                <strong>D{item.day}</strong>
                <span>{item.gems * multiplier}</span>
                {item.label && <small>{item.label}</small>}
              </div>
            );
          })}
        </div>

        <div className="milestones">
          <span>Day 3: Streak Bonus</span>
          <span>Day 7: Weekly bonus</span>
        </div>

        <div className="fn-reward-card">
          <Coins size={34} className="reward-coins-icon" />
          <div className="reward-amount">+{rewardAmount} gems</div>
          <div className="reward-subtitle">
            {subscriptionTier === 'vip'
              ? 'VIP double reward active'
              : reward.label || 'Explorer reward'}
          </div>
        </div>

        {alreadyClaimed ? (
          <div className="claimed-status">
            <Check size={20} /> Today's reward is claimed. The signal returns tomorrow.
          </div>
        ) : (
          <button
            className={`claim-btn ${claiming ? 'loading' : ''}`}
            onClick={handleClaim}
            disabled={claiming}
          >
            {claiming ? 'Opening cache...' : `Claim ${rewardAmount} gems`}
          </button>
        )}
      </div>

      <style>{`
        .fn-reward-overlay {
          position: fixed;
          inset: 0;
          background: color-mix(in srgb, var(--surface) 85%, transparent);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          direction: ltr;
          font-family: 'Outfit', system-ui, sans-serif;
        }
        .fn-reward-modal {
          position: relative;
          background: var(--surface);
          border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
          box-shadow: 0 0 35px color-mix(in srgb, var(--warning) 15%, transparent), 0 20px 50px color-mix(in srgb, var(--shadow-color) 80%, transparent);
          border-radius: 8px;
          width: min(560px, 100%);
          padding: 30px 24px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          overflow: hidden;
          color: var(--text);
          animation: fn-modal-enter 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pixel-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            radial-gradient(circle, color-mix(in srgb, var(--success) 22%, transparent) 0 2px, transparent 3px),
            radial-gradient(circle, color-mix(in srgb, var(--danger) 18%, transparent) 0 1px, transparent 2px);
          background-size: 44px 44px, 70px 70px;
          animation: particles-drift 14s linear infinite;
        }
        .fn-close-btn {
          position: absolute;
          top: 14px;
          right: 14px;
          background: color-mix(in srgb, var(--surface-tint) 3%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 8%, transparent);
          color: var(--text-muted);
          cursor: pointer;
          border-radius: 6px;
          padding: 6px;
          z-index: 2;
        }
        .fn-reward-icon-wrapper { position: relative; margin-bottom: 12px; z-index: 1; }
        .reward-gift-icon {
          color: var(--warning);
          filter: drop-shadow(0 0 12px color-mix(in srgb, var(--warning) 50%, transparent));
          animation: float-gift 3s ease-in-out infinite;
        }
        .fn-reward-icon-wrapper.opening .reward-gift-icon { animation: gift-open 900ms ease both; }
        .sparkle-1, .sparkle-2 { position: absolute; color: var(--success); }
        .sparkle-1 { top: -6px; right: -14px; }
        .sparkle-2 { bottom: -4px; left: -16px; color: var(--danger); }
        .fn-reward-modal h3 { margin: 0 0 6px; font-size: 1.35rem; font-weight: 900; position: relative; }
        .fn-reward-modal p { margin: 0 0 18px; color: var(--text-muted); font-size: 0.86rem; position: relative; }
        .streak-calendar {
          position: relative;
          display: grid;
          grid-template-columns: repeat(7, minmax(52px, 1fr));
          gap: 8px;
          width: 100%;
          margin-bottom: 14px;
        }
        .streak-cell {
          min-height: 74px;
          padding: 8px 5px;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--border) 8%, transparent);
          background: color-mix(in srgb, var(--surface-tint) 3%, transparent);
          color: var(--text-muted);
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 3px;
          clip-path: polygon(10% 0, 90% 0, 100% 20%, 100% 80%, 90% 100%, 10% 100%, 0 80%, 0 20%);
        }
        .streak-cell strong { color: var(--text); font-size: 0.78rem; }
        .streak-cell span { color: var(--success); font-weight: 900; }
        .streak-cell small { color: var(--warning); font-size: 0.58rem; line-height: 1.1; }
        .streak-cell.claimed {
          background: color-mix(in srgb, var(--warning) 14%, transparent);
          border-color: color-mix(in srgb, var(--warning) 45%, transparent);
          box-shadow: 0 0 14px color-mix(in srgb, var(--warning) 22%, transparent);
        }
        .streak-cell.today {
          border-color: color-mix(in srgb, var(--success) 80%, transparent);
          animation: today-pulse 1.5s ease-in-out infinite;
        }
        .milestones {
          position: relative;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
          width: 100%;
          margin-bottom: 16px;
        }
        .milestones span {
          border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
          color: var(--warning);
          background: color-mix(in srgb, var(--warning) 8%, transparent);
          border-radius: 6px;
          padding: 6px;
          font-size: 0.66rem;
          font-weight: 800;
        }
        .fn-reward-card {
          position: relative;
          width: 100%;
          padding: 18px;
          margin-bottom: 18px;
          border-radius: 8px;
          border: 1px dashed color-mix(in srgb, var(--warning) 40%, transparent);
          background: color-mix(in srgb, var(--warning) 8%, transparent);
        }
        .reward-coins-icon { color: var(--warning); }
        .reward-amount { font-size: 1.55rem; font-weight: 900; color: var(--success); }
        .reward-subtitle { color: var(--text-muted); font-size: 0.78rem; }
        .claim-btn {
          position: relative;
          width: 100%;
          background: linear-gradient(90deg, var(--accent-fill), var(--accent-fill));
          color: var(--on-accent);
          border: 0;
          padding: 14px;
          border-radius: 6px;
          font-weight: 900;
          cursor: pointer;
        }
        .claim-btn.loading { opacity: 0.75; cursor: wait; }
        .claimed-status {
          position: relative;
          width: 100%;
          color: var(--success);
          background: color-mix(in srgb, var(--success) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
          border-radius: 6px;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-weight: 800;
        }
        @keyframes fn-modal-enter {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes float-gift { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes gift-open {
          0% { transform: scale(1) rotate(0); }
          45% { transform: scale(1.12) rotate(-8deg); }
          100% { transform: scale(1.02) rotate(6deg); }
        }
        @keyframes today-pulse { 50% { opacity: .75; } }
        @keyframes particles-drift {
          from { background-position: 0 0, 0 0; }
          to { transform: translate(20px, 24px); }
        }
        @media (max-width: 620px) {
          .streak-calendar { grid-template-columns: repeat(4, 1fr); }
          .milestones { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}
