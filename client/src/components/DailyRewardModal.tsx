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
  { day: 1, gems: 25 },
  { day: 2, gems: 30 },
  { day: 3, gems: 50, label: 'Streak Bonus!' },
  { day: 4, gems: 30 },
  { day: 5, gems: 35 },
  { day: 6, gems: 40 },
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
          <span>Day 7: Neon Noir</span>
          <span>Day 14: Deep Cache</span>
          <span>Day 30: Network Legend</span>
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
        .fn-reward-modal {
          position: relative;
          background: #0d0e17;
          border: 1px solid rgba(255,170,0,0.3);
          box-shadow: 0 0 35px rgba(255,170,0,0.15), 0 20px 50px rgba(0,0,0,0.8);
          border-radius: 8px;
          width: min(560px, 100%);
          padding: 30px 24px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          overflow: hidden;
          color: #e2e8f0;
          animation: fn-modal-enter 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pixel-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            radial-gradient(circle, rgba(0,230,184,0.22) 0 2px, transparent 3px),
            radial-gradient(circle, rgba(255,68,204,0.18) 0 1px, transparent 2px);
          background-size: 44px 44px, 70px 70px;
          animation: particles-drift 14s linear infinite;
        }
        .fn-close-btn {
          position: absolute;
          top: 14px;
          right: 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          color: #94a3b8;
          cursor: pointer;
          border-radius: 6px;
          padding: 6px;
          z-index: 2;
        }
        .fn-reward-icon-wrapper { position: relative; margin-bottom: 12px; z-index: 1; }
        .reward-gift-icon {
          color: #ffaa00;
          filter: drop-shadow(0 0 12px rgba(255,170,0,0.5));
          animation: float-gift 3s ease-in-out infinite;
        }
        .fn-reward-icon-wrapper.opening .reward-gift-icon { animation: gift-open 900ms ease both; }
        .sparkle-1, .sparkle-2 { position: absolute; color: #00e6b8; }
        .sparkle-1 { top: -6px; right: -14px; }
        .sparkle-2 { bottom: -4px; left: -16px; color: #ff44cc; }
        .fn-reward-modal h3 { margin: 0 0 6px; font-size: 1.35rem; font-weight: 900; position: relative; }
        .fn-reward-modal p { margin: 0 0 18px; color: #94a3b8; font-size: 0.86rem; position: relative; }
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
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: #64748b;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 3px;
          clip-path: polygon(10% 0, 90% 0, 100% 20%, 100% 80%, 90% 100%, 10% 100%, 0 80%, 0 20%);
        }
        .streak-cell strong { color: #e2e8f0; font-size: 0.78rem; }
        .streak-cell span { color: #00e6b8; font-weight: 900; }
        .streak-cell small { color: #ffaa00; font-size: 0.58rem; line-height: 1.1; }
        .streak-cell.claimed {
          background: rgba(255,170,0,0.14);
          border-color: rgba(255,170,0,0.45);
          box-shadow: 0 0 14px rgba(255,170,0,0.22);
        }
        .streak-cell.today {
          border-color: rgba(0,230,184,0.8);
          animation: today-pulse 1.5s ease-in-out infinite;
        }
        .milestones {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          width: 100%;
          margin-bottom: 16px;
        }
        .milestones span {
          border: 1px solid rgba(255,170,0,0.3);
          color: #ffaa00;
          background: rgba(255,170,0,0.08);
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
          border: 1px dashed rgba(255,170,0,0.4);
          background: rgba(255,170,0,0.08);
        }
        .reward-coins-icon { color: #ffaa00; }
        .reward-amount { font-size: 1.55rem; font-weight: 900; color: #00e6b8; }
        .reward-subtitle { color: #94a3b8; font-size: 0.78rem; }
        .claim-btn {
          position: relative;
          width: 100%;
          background: linear-gradient(90deg, #ffaa00, #00e6b8);
          color: #06110e;
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
          color: #44ff88;
          background: rgba(68,255,136,0.12);
          border: 1px solid rgba(68,255,136,0.3);
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
        @keyframes today-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(0,230,184,0); }
          50% { box-shadow: 0 0 16px rgba(0,230,184,0.5); }
        }
        @keyframes particles-drift {
          from { background-position: 0 0, 0 0; }
          to { background-position: 90px 120px, -80px 70px; }
        }
        @media (max-width: 620px) {
          .streak-calendar { grid-template-columns: repeat(4, 1fr); }
          .milestones { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}
