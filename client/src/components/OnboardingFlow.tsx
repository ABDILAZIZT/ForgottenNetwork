import { useEffect, useRef, useState } from 'react';
import { Gift } from 'lucide-react';
import { useModal } from './useModal';

interface Props {
  onOpenReward: () => void;
  canPublish: boolean;
  alreadyClaimed: boolean;
}

export default function OnboardingFlow({ onOpenReward, canPublish, alreadyClaimed }: Props) {
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => localStorage.getItem('fn_visited') !== 'true',
  );
  const [hintOpen, setHintOpen] = useState(false);
  const [rewardPromptOpen, setRewardPromptOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const welcomeRef = useModal(welcomeOpen, () => enter());
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  const toggleSound = () => {
    if (!audio.current) {
      const context = new AudioContext();
      audio.current = context;
      const gain = context.createGain();
      gain.gain.value = 0.006;
      gain.connect(context.destination);
      [110, 164.81].forEach((frequency) => {
        const osc = context.createOscillator();
        osc.frequency.value = frequency;
        osc.connect(gain);
        osc.start();
      });
    }
    if (sound) void audio.current.suspend();
    else void audio.current.resume();
    setSound(!sound);
  };

  useEffect(() => {
    if (welcomeOpen) return;
    if (localStorage.getItem('fn_hint_shown') !== 'true') {
      const hintTimer = window.setTimeout(() => {
        setHintOpen(true);
        localStorage.setItem('fn_hint_shown', 'true');
      }, 3000);
      const dismissTimer = window.setTimeout(() => setHintOpen(false), 9000);
      return () => {
        window.clearTimeout(hintTimer);
        window.clearTimeout(dismissTimer);
      };
    }
  }, [welcomeOpen]);

  useEffect(() => {
    if (welcomeOpen || alreadyClaimed) {
      setRewardPromptOpen(false);
      return;
    }
    const today = new Date().toDateString();
    if (localStorage.getItem('fn_last_reward_date') === today) return;
    const showTimer = window.setTimeout(() => setRewardPromptOpen(true), 10000);
    const hideTimer = window.setTimeout(() => setRewardPromptOpen(false), 18000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [welcomeOpen, alreadyClaimed]);

  const enter = () => {
    localStorage.setItem('fn_visited', 'true');
    void audio.current?.suspend();
    setSound(false);
    setWelcomeOpen(false);
  };

  return (
    <>
      {welcomeOpen && (
        <div
          className="fn-onboarding-welcome"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Forgotten Network"
          ref={welcomeRef}
          tabIndex={-1}
        >
          <div className="fn-cinematic" aria-hidden="true">
            {Array.from({ length: 20 }, (_, i) => (
              <i
                key={i}
                style={{ left: ((i * 37) % 100) + '%', animationDelay: -(i % 15) + 's' }}
              />
            ))}
          </div>
          <div className="welcome-copy">
            <div className="fn-typewriter">You've found something hidden...</div>
            <h1>You've entered the Forgotten Network</h1>
            <p>An infinite pixel world, built by everyone.</p>
            <span>Draw your mark. Explore the unknown. Leave something behind.</span>
            <button onClick={enter}>Start Exploring</button>
            <button onClick={toggleSound} aria-pressed={sound}>
              {sound ? 'Mute ambience' : 'Enable ambience'}
            </button>
          </div>
        </div>
      )}

      {hintOpen && (
        <div className="fn-tool-hint">
          <span>
            {canPublish
              ? 'Pick a color and start drawing your mark on the world'
              : 'Explore freely. Sign in to leave your mark.'}
          </span>
        </div>
      )}

      {rewardPromptOpen && (
        <button
          className="fn-first-reward"
          onClick={() => {
            setRewardPromptOpen(false);
            onOpenReward();
          }}
        >
          <Gift size={18} /> Claim your daily reward!
        </button>
      )}

      <style>{`
        .fn-onboarding-welcome {
          position: fixed;
          inset: 0;
          z-index: 950;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(3,6,10,0.38);
          backdrop-filter: blur(7px);
          direction: ltr;
          font-family: 'Outfit', system-ui, sans-serif;
        }
        .welcome-copy {
          width: min(720px, calc(100vw - 36px));
          text-align: center;
          color: #e2e8f0;
          animation: fn-modal-enter 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .welcome-copy h1 {
          margin: 0 0 12px;
          font-size: 3rem;
          line-height: 0.98;
          letter-spacing: 0;
          text-shadow: 0 0 28px rgba(0,230,184,0.35);
        }
        .welcome-copy p {
          margin: 0 0 8px;
          color: #00e6b8;
          font-size: 1.24rem;
          font-weight: 800;
        }
        .welcome-copy span {
          display: block;
          color: #94a3b8;
          margin-bottom: 24px;
        }
        .welcome-copy button, .fn-first-reward {
          border: 0;
          border-radius: 6px;
          background: linear-gradient(90deg, #00e6b8, #ffaa00);
          color: #05110f;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 0 22px rgba(0,230,184,0.28);
        }
        .welcome-copy button {
          padding: 14px 24px;
          font-size: 1rem;
        }
        .fn-tool-hint {
          position: fixed;
          top: 40%;
          right: 88px;
          z-index: 900;
          width: 220px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(0,230,184,0.3);
          background: rgba(13,14,23,0.94);
          color: #e2e8f0;
          font: 800 0.78rem 'Outfit', system-ui, sans-serif;
          box-shadow: 0 0 18px rgba(0,230,184,0.22);
          animation: hint-pop 260ms ease both;
        }
        .fn-tool-hint::before {
          content: '';
          position: absolute;
          right: -9px;
          top: 18px;
          border-top: 8px solid transparent;
          border-bottom: 8px solid transparent;
          border-left: 9px solid rgba(0,230,184,0.7);
        }
        .fn-first-reward {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 900;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 13px 16px;
          animation: reward-prompt-pulse 1.6s ease-in-out infinite;
        }
        @keyframes fn-modal-enter {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes hint-pop {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes reward-prompt-pulse {
          0%, 100% { transform: translateY(0); box-shadow: 0 0 15px rgba(255,170,0,0.24); }
          50% { transform: translateY(-3px); box-shadow: 0 0 24px rgba(255,170,0,0.45); }
        }
      `}</style>
    </>
  );
}
