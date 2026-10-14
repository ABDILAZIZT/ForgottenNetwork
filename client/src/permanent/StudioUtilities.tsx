import { useEffect, useState } from 'react';
import ShopModal, { GEM_SHOP_ITEMS } from '../components/ShopModal';
import DailyRewardModal from '../components/DailyRewardModal';
import AdBannerModal from '../components/AdBannerModal';
import AdSlot from '../components/AdSlot';
import CommunityPanel from '../components/CommunityPanel';
import WorldExtras from '../components/WorldExtras';
import { useWorldRepository } from '../repositories';
import type { ChunkRecord } from '../repositories/types';
import { AuthClient, type SessionUser } from '../auth';
import { api } from './api';
import { download } from '../download';
import {
  dailyCount,
  dailyReward,
  effectiveStreak,
  ownedItems,
  readBeacons,
  readClaims,
  readNumber,
  readTier,
  recordRewardedAd,
  todayKey,
  type SubscriptionTier,
} from '../economy';
import type { PermanentEngine } from './CanvasEngine';
import RasterStudio from './RasterStudio';
import SavedEntities from './SavedEntities';
import { useModal } from '../components/useModal';
const auth = new AuthClient({ baseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1' });
function chunkImage(chunk: ChunkRecord) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  for (const bytes of chunk.layers) {
    const layer = document.createElement('canvas');
    layer.width = layer.height = 128;
    layer
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(bytes), 128, 128), 0, 0);
    ctx.drawImage(layer, 0, 0);
  }
  return c.toDataURL('image/png');
}
export default function StudioUtilities({
  token,
  engine,
  onMedia,
  onNotice,
  open,
  onClose,
}: {
  token?: string;
  engine: PermanentEngine | null;
  onMedia: (file: File) => void;
  onNotice: (message: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const repository = useWorldRepository();
  const [repositoryStatus, setRepositoryStatus] = useState(() => repository.getStatus());
  useEffect(() => repository.subscribeStatus(setRepositoryStatus), [repository]);
  const setOpen = (_value: boolean) => onClose();
  const [pane, setPane] = useState(''),
    [revision, setRevision] = useState(0),
    [gems, setGems] = useState(() => readNumber('fn_user_gems', 150)),
    [tier, setTier] = useState<SubscriptionTier>(readTier),
    [owned, setOwned] = useState(ownedItems);
  const [user, setUser] = useState<SessionUser | null>(null),
    [oidc, setOidc] = useState(false),
    [chunks, setChunks] = useState<ChunkRecord[]>([]),
    [edit, setEdit] = useState<ChunkRecord | null>(null),
    [working, setWorking] = useState(false);
  const modal = useModal(open && !pane && !edit, () => setOpen(false));
  const camera = engine?.camera,
    x = Math.round(camera?.x || 0),
    y = Math.round(camera?.y || 0);
  const refresh = () => {
    setGems(readNumber('fn_user_gems', 150));
    setTier(readTier());
    setOwned(ownedItems());
    setRevision((n) => n + 1);
  };
  useEffect(() => {
    if (open) refresh();
  }, [open]);
  useEffect(() => {
    void auth
      .getConfiguration()
      .then((c) => setOidc(c.enabled))
      .catch(() => undefined);
    void auth
      .getSession()
      .then(setUser)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    repository.setPublishingIdentity?.(user?.publishingAllowed ? user.id : null);
  }, [repository, user]);
  const award = (amount: number) => {
    const current = readNumber('fn_user_gems', 150);
    if (amount > 0 && current >= 100000) return;
    localStorage.setItem(
      'fn_user_gems',
      String(Math.max(0, amount < 0 ? current + amount : Math.min(100000, current + amount))),
    );
    refresh();
  };
  const guarded = async (work: () => Promise<void>) => {
    setWorking(true);
    try {
      await work();
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const bridge = () =>
    guarded(async () => {
      if (!token) throw new Error('Create or restore an artist identity first.');
      await api('/classic-session', token, {});
      setUser(await auth.getSession());
      onNotice('Saved-world session connected.');
    });
  const buy = (id: string, cost: number) => {
    const item = GEM_SHOP_ITEMS.find((i) => i.id === id);
    if (
      !item ||
      item.cost !== cost ||
      (!item.repeatable && ownedItems().includes(id)) ||
      readNumber('fn_user_gems', 150) < cost
    )
      return;
    if (id === 'teleport_beacon')
      localStorage.setItem(
        'fn_beacons',
        JSON.stringify([
          ...readBeacons(),
          { id: crypto.randomUUID(), name: 'Beacon ' + (readBeacons().length + 1), x, y },
        ]),
      );
    if (id === 'land_license')
      localStorage.setItem(
        'fn_claimed_chunks',
        JSON.stringify([
          ...readClaims().filter(
            (c) => c.cx !== Math.floor(x / 128) || c.cy !== Math.floor(y / 128),
          ),
          {
            cx: Math.floor(x / 128),
            cy: Math.floor(y / 128),
            owner: 'me',
            expiresAt: Date.now() + 30 * 86400000,
          },
        ]),
      );
    if (id === 'extra_upload_slot') {
      localStorage.setItem(
        'fn_upload_bonus_today',
        String(dailyCount('fn_upload_bonus_today', 'fn_upload_bonus_date') + 3),
      );
      localStorage.setItem('fn_upload_bonus_date', todayKey());
    }
    if (id === 'brush_size_boost')
      localStorage.setItem(
        'fn_brush_boost_until',
        String(Math.max(Date.now(), readNumber('fn_brush_boost_until')) + 3600000),
      );
    if (!item.repeatable)
      localStorage.setItem('fn_owned_items', JSON.stringify([...ownedItems(), id]));
    award(-cost);
    onNotice(
      'Demo item saved. Core studio tools are free; local territory markers do not grant ownership.',
    );
  };
  const claim = () => {
    if (localStorage.getItem('fn_last_reward_date') === todayKey()) return;
    const streak = effectiveStreak();
    const amount = dailyReward(readTier(), streak);
    localStorage.setItem('fn_last_reward_date', todayKey());
    localStorage.setItem('fn_streak_count', String(streak + 1));
    if ((streak + 1) % 7 === 0)
      localStorage.setItem(
        'fn_owned_items',
        JSON.stringify([...new Set([...ownedItems(), 'palette_neon_noir'])]),
      );
    award(amount);
  };
  return (
    <>
      <WorldExtras
        engine={engine}
        subscriptionTier={tier}
        ownedItems={owned}
        revision={revision}
        onToast={onNotice}
      />
      {open && !pane && !edit && (
        <div className="rs-backdrop">
          <section
            className="rs-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Tools and saved worlds"
            ref={modal}
            tabIndex={-1}
          >
            <header>
              <h2>Tools & saved worlds</h2>
              <button onClick={() => setOpen(false)}>Close</button>
            </header>
            <p>
              One studio. Existing saved-world data, local rewards and identity providers remain
              available here. Core drawing tools are free.
            </p>
            <div className="rs-tools">
              <button onClick={() => setPane('rewards')}>Daily reward</button>
              <button onClick={() => setPane('ads')}>Optional demo ad</button>
              <button onClick={() => setPane('shop')}>
                Saved demo rewards & cosmetics ({gems})
              </button>
              <button onClick={() => setPane('community')}>
                Saved-world community & moderation
              </button>
            </div>
            {tier !== 'vip' && (
              <AdSlot slotId="ad-slot-sidebar" position="tools-panel-sidebar" size="rectangle" />
            )}
            <h3>Saved-world sign-in</h3>
            <p>{user ? user.displayName : 'Not connected to saved worlds'}</p>
            {!user && (
              <>
                <button disabled={working || !token} onClick={() => void bridge()}>
                  Connect artist identity
                </button>
                {oidc && (
                  <button onClick={() => auth.signIn('/')}>Sign in with identity provider</button>
                )}
              </>
            )}
            {user && (
              <button
                onClick={() =>
                  void guarded(async () => {
                    await auth.signOut();
                    setUser(null);
                  })
                }
              >
                Sign out of saved worlds
              </button>
            )}
            <h3>Preserved worlds</h3>
            <p role="status">
              {repositoryStatus.message} · {repositoryStatus.pendingWrites} pending saved-world
              writes
            </p>
            {repositoryStatus.pendingWrites > 0 && (
              <div>
                <button
                  disabled={working}
                  onClick={() => void guarded(() => repository.retryPending())}
                >
                  Retry pending saved-world writes
                </button>
                <button
                  disabled={working}
                  onClick={() => {
                    if (
                      confirm(
                        'Discard pending saved-world changes on this device? Unsaved changes will be lost.',
                      )
                    )
                      void guarded(() => repository.discardPending());
                  }}
                >
                  Discard pending saved-world writes
                </button>
              </div>
            )}
            <p>
              The earlier world format is preserved. Tile editing uses the same owner/version
              checks; publishing to the modern canvas requires an explicit draft. Editing a tile
              flattens its three raster layers. Remote revisions retain server history; export a
              local backup before editing browser-only tiles.
            </p>
            <button
              disabled={working}
              onClick={() =>
                void guarded(async () => {
                  const json = await repository.exportWorld({ skipPendingWrites: true });
                  download(
                    new Blob([json], { type: 'application/json' }),
                    'forgotten-world-archive.json',
                  );
                })
              }
            >
              Export saved world JSON
            </button>
            <p>
              Exports contain the saved snapshot. Pending writes are not included; resolve them
              first to include those changes.
            </p>
            <label>
              {repository.mode === 'local'
                ? 'Replace local saved world from JSON'
                : 'Import shared-world revisions from JSON'}
              <input
                type="file"
                accept="application/json,.json"
                disabled={working || (repository.mode === 'remote' && !user?.publishingAllowed)}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (
                    f &&
                    confirm(
                      repository.mode === 'local'
                        ? 'Replace the entire local saved world (tiles, media and assets) with this file? Export a backup first. This cannot be undone automatically.'
                        : 'Import revisions into the shared saved-world repository? Existing owner and version checks apply.',
                    )
                  )
                    void guarded(async () => {
                      const count = await repository.importWorld(await f.text());
                      onNotice('Imported ' + count + ' records.');
                    });
                }}
              />
            </label>
            <button
              disabled={working}
              onClick={() =>
                void guarded(async () => setChunks(await repository.loadInitialChunks()))
              }
            >
              Browse saved tiles
            </button>
            <SavedEntities onNotice={onNotice} x={x} y={y} />
            <div className="saved-tiles">
              {chunks.map((chunk) => (
                <article key={chunk.id}>
                  <img
                    src={chunkImage(chunk)}
                    alt={`Saved artwork tile at ${chunk.cx * 128}, ${chunk.cy * 128}`}
                  />
                  <p>
                    {chunk.cx * 128}, {chunk.cy * 128}
                  </p>
                  <button
                    disabled={working || (repository.mode === 'remote' && !user?.publishingAllowed)}
                    onClick={() => setEdit(chunk)}
                  >
                    Edit saved tile
                  </button>
                  <button
                    disabled={working}
                    onClick={() => {
                      if (
                        confirm(
                          'Delete only this saved tile? Export your archive first for a local backup.',
                        )
                      )
                        void guarded(async () => {
                          await repository.deleteChunk(chunk.id, chunk.version);
                          await repository.flush();
                          setChunks(await repository.loadInitialChunks());
                        });
                    }}
                  >
                    Delete saved tile
                  </button>
                  <button
                    onClick={() =>
                      void guarded(async () => {
                        const blob = await (await fetch(chunkImage(chunk))).blob();
                        onMedia(new File([blob], 'saved-tile.png', { type: 'image/png' }));
                        setOpen(false);
                      })
                    }
                  >
                    Prepare a modern draft
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {edit && (
        <RasterStudio
          source={chunkImage(edit)}
          label="Save tile revision"
          onClose={() => setEdit(null)}
          onSave={async (blob) => {
            const image = await createImageBitmap(blob),
              c = document.createElement('canvas');
            c.width = c.height = 128;
            const ctx = c.getContext('2d')!;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(image, 0, 0, 128, 128);
            image.close();
            await repository.saveChunk({
              ...edit,
              layers: [
                new Uint8Array(128 * 128 * 4),
                new Uint8Array(ctx.getImageData(0, 0, 128, 128).data),
                new Uint8Array(128 * 128 * 4),
              ],
              savedAt: Date.now(),
            });
            await repository.flush();
            setEdit(null);
            setChunks(await repository.loadInitialChunks());
          }}
        />
      )}
      {pane === 'community' && (
        <CommunityPanel
          user={user}
          canPublish={repository.mode === 'local' || Boolean(user?.publishingAllowed)}
          x={x}
          y={y}
          onVisit={(a, b) => {
            engine?.fly(a, b);
            setPane('');
            setOpen(false);
          }}
          onClose={() => setPane('')}
        />
      )}
      <DailyRewardModal
        isOpen={pane === 'rewards'}
        onClose={() => setPane('')}
        onClaimReward={claim}
        alreadyClaimed={localStorage.getItem('fn_last_reward_date') === todayKey()}
        subscriptionTier={tier}
        streakCount={effectiveStreak()}
      />
      <AdBannerModal
        isOpen={pane === 'ads'}
        onClose={() => setPane('')}
        subscriptionTier={tier}
        adsWatchedToday={dailyCount('fn_ads_today', 'fn_ads_last_date')}
        onAdWatched={(amount) => {
          if (recordRewardedAd(amount, readTier())) award(amount);
        }}
      />
      <ShopModal
        isOpen={pane === 'shop'}
        onClose={() => setPane('')}
        userGems={gems}
        ownedItems={owned}
        subscriptionTier={tier}
        streakCount={effectiveStreak()}
        adsWatchedToday={dailyCount('fn_ads_today', 'fn_ads_last_date')}
        onPurchaseItem={buy}
        onActivateSubscription={(next) => {
          const old = readTier();
          if (old === next || old === 'vip') return;
          localStorage.setItem('fn_subscription_tier', next);
          localStorage.setItem('fn_user_vip', String(next === 'vip'));
          award(next === 'vip' ? (old === 'artist' ? 500 : 800) : 300);
        }}
        onAddGems={(amount) => {
          if (Date.now() - readNumber('fn_legacy_grant_at') < 86400000) return;
          localStorage.setItem('fn_legacy_grant_at', String(Date.now()));
          award(Math.min(3000, Math.max(0, amount)));
        }}
      />
    </>
  );
}
