import { useEffect, useState } from 'react';
import { Map, MapPin, Shield, Share2, X } from 'lucide-react';
import type { WorldEngine } from '../engine/Engine';
import { readBeacons, readClaims, type SubscriptionTier } from '../economy';
import { locationUrl } from '../location';

interface Props {
  engine: WorldEngine | null;
  subscriptionTier: SubscriptionTier;
  ownedItems: string[];
  revision: number;
  onToast: (message: string) => void;
}

export default function WorldExtras({
  engine,
  subscriptionTier,
  ownedItems,
  revision,
  onToast,
}: Props) {
  const [open, setOpen] = useState(false);
  const [heatmap, setHeatmap] = useState(false);
  const [beacons, setBeacons] = useState(readBeacons);
  const claims = readClaims();
  const canMap = ownedItems.includes('chunk_visitor_map');
  useEffect(() => {
    setBeacons(readBeacons());
    engine?.setClaims(readClaims());
  }, [engine, revision]);
  useEffect(() => {
    engine?.setHeatmap(canMap && heatmap);
  }, [engine, canMap, heatmap]);
  if (!beacons.length && !claims.length && !canMap && subscriptionTier !== 'vip') return null;

  const claim = () => {
    const camera = engine?.getCamera();
    if (!camera) return;
    const cx = Math.floor(camera.x / 128),
      cy = Math.floor(camera.y / 128);
    const current = readClaims();
    if (current.some((item) => item.cx === cx && item.cy === cy)) {
      onToast('This chunk is already claimed');
      return;
    }
    if (current.filter((item) => item.owner === 'me').length >= 3) {
      onToast('Your three claim slots are full');
      return;
    }
    const next = [...current, { cx, cy, owner: 'me', expiresAt: Date.now() + 30 * 86400000 }];
    localStorage.setItem('fn_claimed_chunks', JSON.stringify(next));
    engine?.setClaims(next);
    onToast(`Claimed chunk ${cx}, ${cy} for 30 days on this device`);
  };

  return (
    <aside className="fn-extras fn-panel" aria-label="World unlocks">
      <button
        className="fn-btn"
        title={open ? 'Close world unlocks' : 'World unlocks'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={17} /> : <MapPin size={17} />}
      </button>
      {open && (
        <div className="fn-extras-content">
          {canMap && (
            <label>
              <input
                type="checkbox"
                checked={heatmap}
                onChange={(event) => setHeatmap(event.target.checked)}
              />
              <Map size={15} /> Pixel density map
            </label>
          )}
          {subscriptionTier === 'vip' && (
            <button onClick={claim}>
              <Shield size={15} /> Claim current chunk
            </button>
          )}
          {claims
            .filter((item) => item.owner === 'me')
            .map((item) => (
              <small key={`${item.cx},${item.cy}`}>
                Protected locally: {item.cx}, {item.cy}
              </small>
            ))}
          {beacons.map((beacon) => (
            <div className="fn-beacon" key={beacon.id}>
              <input
                aria-label="Beacon name"
                maxLength={48}
                value={beacon.name}
                onChange={(event) => {
                  const next = beacons.map((item) =>
                    item.id === beacon.id ? { ...item, name: event.target.value } : item,
                  );
                  setBeacons(next);
                  localStorage.setItem('fn_beacons', JSON.stringify(next));
                }}
              />
              <button
                title={`Visit ${beacon.name}`}
                onClick={() => engine?.getCamera().teleportTo(beacon.x, beacon.y)}
              >
                <MapPin size={16} />
              </button>
              <button
                title={`Share ${beacon.name}`}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(
                      locationUrl(location.origin, location.pathname, beacon.x, beacon.y, 1.5),
                    )
                    .then(
                      () => onToast('Beacon link copied'),
                      () => onToast('Could not copy beacon link'),
                    );
                }}
              >
                <Share2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
