export type SubscriptionTier = 'free' | 'artist' | 'vip';

interface Props {
  tier: SubscriptionTier;
}

export default function SubscriptionBadge({ tier }: Props) {
  if (tier === 'free') return null;

  return (
    <span className={`fn-subscription-badge ${tier}`}>
      {tier === 'artist' ? '[Artist]' : '[Crown VIP]'}
      <style>{`
        .fn-subscription-badge {
          display: inline-flex;
          align-items: center;
          min-height: 22px;
          padding: 0 8px;
          border-radius: 999px;
          font-family: 'Outfit', system-ui, sans-serif;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .fn-subscription-badge.artist {
          color: #00120f;
          background: linear-gradient(135deg, #00e6b8, #88ffee);
          box-shadow: 0 0 12px rgba(0, 230, 184, 0.35);
        }
        .fn-subscription-badge.vip {
          color: #100900;
          background: linear-gradient(135deg, #ffaa00, #fff0a8, #ff44cc);
          box-shadow: 0 0 18px rgba(255, 170, 0, 0.45);
          animation: fn-vip-badge-pulse 1.8s ease-in-out infinite;
        }
        @keyframes fn-vip-badge-pulse {
          0%, 100% { filter: brightness(1); transform: translateY(0); }
          50% { filter: brightness(1.18); transform: translateY(-1px); }
        }
      `}</style>
    </span>
  );
}
