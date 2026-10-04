import { useEffect, useRef } from 'react';

export default function AdSlot({
  slotId,
  size = 'rectangle',
  position,
}: {
  slotId: string;
  size?: 'banner' | 'rectangle' | 'leaderboard';
  position: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const comment = document.createComment(
      ' REPLACE THIS WITH YOUR AD NETWORK CODE — AD_SLOT_PLACEHOLDER ',
    );
    ref.current?.prepend(comment);
    return () => comment.remove();
  }, []);
  return (
    <aside
      className={`fn-ad-slot ${size}`}
      aria-label="Advertisement placeholder"
      data-slot-id={slotId}
      data-position={position}
    >
      <small>ADVERTISEMENT · PREVIEW</small>
      <div ref={ref}>
        <strong>YOUR AD HERE</strong>
        <span>
          {size === 'rectangle' ? '300 × 250' : size === 'leaderboard' ? '728 × 90' : '320 × 50'}
        </span>
      </div>
    </aside>
  );
}
