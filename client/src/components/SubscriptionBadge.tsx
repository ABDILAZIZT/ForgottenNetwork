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
          color: var(--on-accent);
          background: linear-gradient(135deg, var(--accent-fill), var(--accent-fill));
          box-shadow: 0 0 12px color-mix(in srgb, var(--success) 35%, transparent);
        }
        .fn-subscription-badge.vip {
          color: var(--on-accent);
          background: linear-gradient(135deg, var(--accent-fill), var(--accent-fill), var(--accent-fill));
          box-shadow: 0 0 18px color-mix(in srgb, var(--warning) 45%, transparent);
          animation: fn-vip-badge-pulse 1.8s ease-in-out infinite;
        }
        @keyframes fn-vip-badge-pulse {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1px); }
        }
      `}</style>
    </span>
  );
}
