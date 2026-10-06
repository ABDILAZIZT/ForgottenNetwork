import { useState, useEffect, useRef, useCallback } from 'react';
import WorldOverlay from './components/WorldOverlay';
import Minimap from './components/Minimap';
import type { MinimapChunk, MinimapViewport } from './components/Minimap';
import { WorldEngine, DrawTool } from './engine/Engine';
import { EntityType } from './engine/Entity';
import { useWorldRepository } from './repositories';
import type { RepositoryStatus } from './repositories';
import { AuthClient } from './auth';
import type { SessionUser } from './auth';
import CommunityPanel from './components/CommunityPanel';
import ShopModal, { GEM_SHOP_ITEMS } from './components/ShopModal';
import DailyRewardModal from './components/DailyRewardModal';
import AdBannerModal from './components/AdBannerModal';
import OnboardingFlow from './components/OnboardingFlow';
import type { SubscriptionTier } from './components/SubscriptionBadge';
import { readLocation, locationUrl } from './location';
import {
  brushLimit,
  dailyCount,
  dailyReward,
  effectiveStreak,
  isString,
  ownedItems as readOwnedItems,
  readArray,
  readBeacons,
  readClaims,
  readNumber,
  readTier,
  todayKey,
} from './economy';
import WorldExtras from './components/WorldExtras';
import Expedition from './components/Expedition';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const authClient = new AuthClient({
  baseUrl: apiBaseUrl,
  developmentToken: import.meta.env.DEV ? import.meta.env.VITE_DEV_AUTH_TOKEN || '' : '',
});

export default function App() {
  const repository = useWorldRepository();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [communityOpen, setCommunityOpen] = useState(
    new URLSearchParams(window.location.search).has('entity'),
  );
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  // Monetization & Gamification state
  const [shopOpen, setShopOpen] = useState(false);
  const [shopInitialTab, setShopInitialTab] = useState<
    'subscriptions' | 'bundles' | 'items' | 'rewards'
  >('subscriptions');
  const [rewardOpen, setRewardOpen] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [userGems, setUserGems] = useState(() => readNumber('fn_user_gems', 150));
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>(readTier);
  const [ownedItems, setOwnedItems] = useState<string[]>(readOwnedItems);
  const [streakCount, setStreakCount] = useState(effectiveStreak);
  const [economyRevision, setEconomyRevision] = useState(0);
  const [brushStyle, setBrushStyle] = useState<'solid' | 'spray'>('solid');
  const [adsWatchedToday, setAdsWatchedToday] = useState<number>(() => {
    const lastDate = localStorage.getItem('fn_ads_last_date');
    const today = new Date().toDateString();
    if (lastDate !== today) return 0;
    return parseInt(localStorage.getItem('fn_ads_today') || '0', 10);
  });
  const [alreadyClaimedDaily, setAlreadyClaimedDaily] = useState<boolean>(() => {
    const lastClaim = localStorage.getItem('fn_last_reward_date');
    const today = new Date().toDateString();
    return lastClaim === today;
  });

  // HUD state
  const [coordX, setCoordX] = useState(0);
  const [coordY, setCoordY] = useState(0);
  const [zoom, setZoom] = useState(1.5);

  // UI States

  const [tool, setToolState] = useState<DrawTool>('pan');
  const [layer, setLayerState] = useState(1);
  const [brushSize, setBrushSizeState] = useState(2);
  const [color, setColorState] = useState('#00e6b8');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [spawnScale, setSpawnScaleState] = useState(1.0);
  const [minimapChunks, setMinimapChunks] = useState<MinimapChunk[]>([]);
  const [minimapViewport, setMinimapViewport] = useState<MinimapViewport>({
    x: 0,
    y: 0,
    zoom: 1.5,
  });
  const [repositoryStatus, setRepositoryStatus] = useState<RepositoryStatus>(
    repository.getStatus(),
  );
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authLoading, setAuthLoading] = useState(repository.mode === 'remote');
  const canPublish =
    repository.mode === 'local' || Boolean(currentUser?.publishingAllowed && !authLoading);

  useEffect(() => {
    if (repository.mode === 'local') return;
    let active = true;
    void Promise.all([authClient.getConfiguration(), authClient.getSession()])
      .then(([configuration, user]) => {
        if (!active) return;
        setAuthEnabled(configuration.enabled);
        setCurrentUser(user);
        repository.setPublishingIdentity?.(user?.publishingAllowed ? user.id : null);
      })
      .catch(() => {
        repository.setPublishingIdentity?.(null);
        if (active) setCurrentUser(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository.mode]);

  // Toast
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setUserGems(readNumber('fn_user_gems', 150));
      setSubscriptionTier(readTier());
      setOwnedItems(readOwnedItems());
      setStreakCount(effectiveStreak());
      setAlreadyClaimedDaily(localStorage.getItem('fn_last_reward_date') === todayKey());
      setAdsWatchedToday(dailyCount('fn_ads_today', 'fn_ads_last_date'));
      setEconomyRevision((value) => value + 1);
    };
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('storage', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', refresh);
      clearTimeout(toastTimer.current);
    };
  }, []);

  // Init engine
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new WorldEngine(canvasRef.current, repository);
    const location = readLocation(window.location.search);
    engine.getCamera().teleportTo(location.x, location.y);
    engine.getCamera().setZoom(location.zoom);
    engineRef.current = engine;
    engine.start();

    // HUD tick
    const tick = setInterval(() => {
      const cam = engine.getCamera();
      setCoordX(Math.round(cam.x));
      setCoordY(Math.round(cam.y));
      setZoom(parseFloat(cam.zoom.toFixed(2)));
    }, 100);

    let lastChunkRevision = -1;
    const minimapTick = setInterval(() => {
      const camera = engine.getCamera();
      setMinimapViewport({ x: camera.x, y: camera.y, zoom: camera.zoom });

      const revision = engine.getChunkRevision();
      if (revision !== lastChunkRevision) {
        lastChunkRevision = revision;
        setMinimapChunks(
          Array.from(engine.getChunks().values(), ({ cx, cy, zoneType }) => ({ cx, cy, zoneType })),
        );
      }
    }, 250);

    const unsubscribeStatus = repository.subscribeStatus(setRepositoryStatus);

    // Tool change from keyboard
    engine.onToolChange = (t) => setToolState(t);

    // Color picked from the world
    engine.onColorPick = (picked) => setColorState(picked);

    // Save status toast
    engine.onSaveStatus = showToast;

    // Sync spawn scale from scroll wheel
    engine.onSpawnScaleChange = (s) => setSpawnScaleState(s);
    engine.setLayer(layer);
    engine.setBrushSize(brushSize);
    engine.setColor(color);
    engine.setReadOnly(repository.mode === 'remote');

    return () => {
      clearInterval(tick);
      clearInterval(minimapTick);
      unsubscribeStatus();
      engine.stop();
    };
  }, [repository, showToast]);

  useEffect(() => {
    const blocked =
      repository.mode === 'remote' &&
      ['retry', 'conflict', 'error', 'rejected'].includes(repositoryStatus.phase);
    engineRef.current?.setReadOnly(!canPublish || blocked);
  }, [canPublish, repository.mode, repositoryStatus.phase]);

  useEffect(() => {
    engineRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    const hasGlowBrush = subscriptionTier !== 'free' || ownedItems.includes('glowing_neon_brush');
    engineRef.current?.setGlowBrush(hasGlowBrush);
  }, [ownedItems, subscriptionTier]);

  useEffect(() => {
    const max = brushLimit(subscriptionTier);
    if (brushSize > max) {
      setBrushSizeState(max);
      engineRef.current?.setBrushSize(max);
    }
    if (subscriptionTier === 'free' && layer !== 1) {
      setLayerState(1);
      engineRef.current?.setLayer(1);
    }
    const style =
      subscriptionTier === 'vip' || ownedItems.includes('spray_brush') ? brushStyle : 'solid';
    engineRef.current?.setBrushStyle(style);
  }, [subscriptionTier, ownedItems, brushSize, layer, brushStyle, economyRevision]);

  // ── Bridge UI → Engine ────────────────────────────────────────────────────

  const setTool = useCallback(
    (t: DrawTool) => {
      const mutating =
        t === 'brush' || t === 'eraser' || t === 'fill' || t === 'spawn' || t === 'delete_entity';
      if (mutating && !canPublish) {
        showToast(authLoading ? 'Checking your session…' : 'Sign in to publish');
        return;
      }
      setToolState(t);
      engineRef.current?.setTool(t);
    },
    [authLoading, canPublish, showToast],
  );

  const handleSignOut = useCallback(async () => {
    if (
      repository.getStatus().pendingWrites > 0 &&
      !window.confirm(
        'There are unsent edits saved on this device. Sign out anyway? Only this account can retry them.',
      )
    )
      return;
    repository.setPublishingIdentity?.(null);
    await authClient.signOut();
    window.location.reload();
  }, [repository]);

  const setLayer = useCallback((nextLayer: number) => {
    setLayerState(nextLayer);
    engineRef.current?.setLayer(nextLayer);
  }, []);

  const setBrushSize = useCallback((size: number) => {
    setBrushSizeState(size);
    engineRef.current?.setBrushSize(size);
  }, []);

  const setColor = useCallback((nextColor: string) => {
    setColorState(nextColor);
    engineRef.current?.setColor(nextColor);
  }, []);

  const setSpawnType = useCallback((type: EntityType, presetId: string | null = null) => {
    setSelectedPresetId(presetId);
    setToolState('spawn');
    engineRef.current?.setSpawnType(type, presetId);
  }, []);

  const setSpawnScale = useCallback((scale: number) => {
    setSpawnScaleState(scale);
    engineRef.current?.setSpawnScale(scale);
  }, []);

  const handleZoomIn = useCallback(() => {
    engineRef.current
      ?.getCamera()
      .zoomAt(
        1.3,
        window.innerWidth / 2,
        window.innerHeight / 2,
        window.innerWidth,
        window.innerHeight,
      );
  }, []);

  const handleZoomOut = useCallback(() => {
    engineRef.current
      ?.getCamera()
      .zoomAt(
        1 / 1.3,
        window.innerWidth / 2,
        window.innerHeight / 2,
        window.innerWidth,
        window.innerHeight,
      );
  }, []);

  const handleTeleport = useCallback(() => {
    engineRef.current?.teleportRandom();
  }, []);

  const handleUndo = useCallback(() => {
    engineRef.current?.undo();
  }, []);

  const handleMinimapTeleport = useCallback((x: number, y: number) => {
    engineRef.current?.getCamera().teleportTo(x, y);
  }, []);

  // ── Save / Load ───────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    try {
      const json = await repository.exportWorld({ skipPendingWrites: !canPublish });
      const blob = new Blob([json], { type: 'application/json' });
      const { download } = await import('./download');
      download(blob, `forgotten-network-${Date.now()}.json`);
      showToast('World exported ✓');
    } catch {
      showToast('Export failed ✗');
    }
  }, [repository, showToast, canPublish]);

  const handleLoadClick = useCallback(() => {
    if (!canPublish) {
      showToast('Sign in to import a world');
      return;
    }
    if (
      repository.mode === 'remote' &&
      !window.confirm(
        'Import copies media and contributions with new IDs and applies the file’s chunks to this world. It is not an all-or-nothing restore: accepted items remain if a later item fails. Use Retry for interrupted imports. Continue?',
      )
    )
      return;
    fileRef.current?.click();
  }, [canPublish, showToast, repository.mode]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!canPublish) {
        showToast('Sign in to import a world');
        e.target.value = '';
        return;
      }
      try {
        if (file.size > 32 * 1024 * 1024) throw new Error('World imports are limited to 32 MB.');
        const text = await file.text();
        const count = await repository.importWorld(text);
        showToast(`Loaded ${count} chunks ✓ — refreshing…`);
        setTimeout(() => window.location.reload(), 1400);
      } catch (error) {
        showToast(error instanceof Error ? `Import stopped: ${error.message}` : 'Import failed');
      }
      e.target.value = '';
    },
    [repository, showToast, canPublish],
  );

  const logGemTransaction = (message: string) => {
    const history = readArray('fn_gem_transactions', isString);
    const stamp = new Date().toLocaleString();
    localStorage.setItem(
      'fn_gem_transactions',
      JSON.stringify([...history.slice(-14), `${stamp} - ${message}`]),
    );
  };

  const handleAddGems = (amount: number) => {
    const next = readNumber('fn_user_gems', 150) + amount;
    if (!Number.isSafeInteger(next) || next < 0) return;
    localStorage.setItem('fn_user_gems', next.toString());
    logGemTransaction(`${amount >= 0 ? '+' : ''}${amount} gems`);
    setUserGems(next);
  };

  const handleActivateSubscription = (tier: 'artist' | 'vip') => {
    const current = readTier();
    if (current === tier || current === 'vip') return;
    setSubscriptionTier(tier);
    localStorage.setItem('fn_subscription_tier', tier);
    localStorage.setItem('fn_user_vip', tier === 'vip' ? 'true' : 'false');
    const stipend = tier === 'vip' ? (current === 'artist' ? 500 : 800) : 300;
    handleAddGems(stipend);
    showToast(`Demo ${tier} activated! +${stipend} gems`);
  };

  const handlePurchaseItem = (itemId: string, cost: number) => {
    const item = GEM_SHOP_ITEMS.find((candidate) => candidate.id === itemId);
    if (!item || item.cost !== cost || (!item.repeatable && readOwnedItems().includes(itemId)))
      return;
    if (readNumber('fn_user_gems', 150) < cost) {
      showToast('Not enough gems!');
      return;
    }
    if (itemId === 'land_license') {
      const camera = engineRef.current?.getCamera();
      if (
        readClaims().some(
          (claim) =>
            claim.cx === Math.floor((camera?.x ?? 0) / 128) &&
            claim.cy === Math.floor((camera?.y ?? 0) / 128) &&
            claim.owner !== 'me',
        )
      ) {
        showToast('This chunk is already protected by its owner');
        return;
      }
    }
    handleAddGems(-cost);
    if (itemId === 'extra_upload_slot') {
      const today = new Date().toDateString();
      const bonus = dailyCount('fn_upload_bonus_today', 'fn_upload_bonus_date');
      localStorage.setItem('fn_upload_bonus_date', today);
      localStorage.setItem('fn_upload_bonus_today', (bonus + 3).toString());
    } else if (itemId === 'brush_size_boost') {
      localStorage.setItem(
        'fn_brush_boost_until',
        (Math.max(Date.now(), readNumber('fn_brush_boost_until')) + 60 * 60 * 1000).toString(),
      );
    } else if (itemId === 'teleport_beacon') {
      const camera = engineRef.current?.getCamera();
      const beacons = readBeacons();
      beacons.push({
        id: crypto.randomUUID(),
        name: `Beacon ${beacons.length + 1}`,
        x: Math.round(camera?.x ?? 0),
        y: Math.round(camera?.y ?? 0),
      });
      localStorage.setItem('fn_beacons', JSON.stringify(beacons));
    } else if (itemId === 'land_license') {
      const camera = engineRef.current?.getCamera();
      const cx = Math.floor((camera?.x ?? 0) / 128);
      const cy = Math.floor((camera?.y ?? 0) / 128);
      const claims = readClaims();
      localStorage.setItem(
        'fn_claimed_chunks',
        JSON.stringify([
          ...claims.filter((claim) => !(claim.cx === cx && claim.cy === cy)),
          { cx, cy, owner: 'me', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 },
        ]),
      );
      showToast(`Chunk ${cx},${cy} protected for 30 days`);
    }
    const previous = readOwnedItems();
    const next = item.repeatable ? previous : [...previous, itemId];
    localStorage.setItem('fn_owned_items', JSON.stringify(next));
    setOwnedItems(next);
    setEconomyRevision((value) => value + 1);
    showToast(`${item.name} ready!`);
  };

  const handleClaimDailyReward = () => {
    if (localStorage.getItem('fn_last_reward_date') === todayKey()) return;
    const streak = effectiveStreak();
    const amount = dailyReward(readTier(), streak);
    localStorage.setItem('fn_last_reward_date', todayKey());
    localStorage.setItem('fn_streak_count', String(streak + 1));
    setStreakCount(streak + 1);
    if ((streak + 1) % 7 === 0) {
      const items = Array.from(new Set([...readOwnedItems(), 'palette_neon_noir']));
      localStorage.setItem('fn_owned_items', JSON.stringify(items));
      setOwnedItems(items);
    }
    handleAddGems(amount);
    setAlreadyClaimedDaily(true);
    localStorage.setItem('fn_last_reward_date', new Date().toDateString());
    showToast(`Claimed daily reward +${amount} Gems`);
  };

  const openShop = (tab: 'subscriptions' | 'bundles' | 'items' | 'rewards' = 'subscriptions') => {
    localStorage.setItem('fn_shop_visited', 'true');
    setShopInitialTab(tab);
    setShopOpen(true);
  };

  return (
    <div
      id="world-root"
      data-reduced-motion={reducedMotion}
      style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      <Expedition
        x={coordX}
        y={coordY}
        reducedMotion={reducedMotion}
        hidden={shopOpen || rewardOpen || adOpen}
        onDiscover={() => {
          const chunks = [...(engineRef.current?.getChunks().values() || [])].filter(
            (chunk) => !chunk.isEmpty(),
          );
          const chosen = chunks[Math.floor(Math.random() * chunks.length)];
          if (chosen) handleMinimapTeleport(chosen.cx * 128 + 64, chosen.cy * 128 + 64);
          else handleTeleport();
        }}
        onVisit={handleMinimapTeleport}
        onDraw={() => setTool('brush')}
        onRefresh={() =>
          void repository.loadAllEntities().then(
            () => showToast('Contributions refreshed'),
            () => showToast('Refresh unavailable'),
          )
        }
      />
      <nav className="fn-community-tools fn-panel" aria-label="World and accessibility">
        <button onClick={() => setCommunityOpen(!communityOpen)} aria-expanded={communityOpen}>
          World & community
        </button>
        <button
          onClick={() =>
            void navigator.clipboard
              .writeText(
                locationUrl(window.location.origin, window.location.pathname, coordX, coordY, zoom),
              )
              .then(
                () => showToast('Location link copied'),
                () => showToast('Could not copy link'),
              )
          }
        >
          Share location
        </button>
        <label>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
          />{' '}
          Reduced motion
        </label>
      </nav>
      {communityOpen && (
        <CommunityPanel
          user={currentUser}
          canPublish={canPublish}
          x={coordX}
          y={coordY}
          onClose={() => setCommunityOpen(false)}
          onVisit={handleMinimapTeleport}
        />
      )}

      <WorldOverlay
        coordX={coordX}
        coordY={coordY}
        zoom={zoom}
        tool={tool}
        layer={layer}
        brushSize={brushSize}
        color={color}
        onToolChange={setTool}
        onLayerChange={setLayer}
        onBrushSizeChange={setBrushSize}
        onColorChange={setColor}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onTeleport={handleTeleport}
        onUndo={handleUndo}
        onSave={handleSave}
        onLoad={handleLoadClick}
        selectedPresetId={selectedPresetId}
        spawnScale={spawnScale}
        onSpawnTypeChange={setSpawnType}
        onSpawnScaleChange={setSpawnScale}
        repositoryStatus={repositoryStatus}
        currentUser={currentUser}
        authEnabled={authEnabled}
        authLoading={authLoading}
        canPublish={canPublish}
        onSignIn={() => authClient.signIn()}
        onSignOut={() => void handleSignOut().catch(() => showToast('Sign-out failed'))}
        userGems={userGems}
        ownedItems={ownedItems}
        brushStyle={brushStyle}
        onBrushStyleChange={setBrushStyle}
        subscriptionTier={subscriptionTier}
        adsWatchedToday={adsWatchedToday}
        alreadyClaimedDaily={alreadyClaimedDaily}
        onOpenShop={openShop}
        onOpenReward={() => setRewardOpen(true)}
        onOpenAd={() => {
          if (subscriptionTier === 'vip') {
            showToast('VIP Crown is ad-free');
            return;
          }
          setAdOpen(true);
        }}
      />

      <ShopModal
        isOpen={shopOpen}
        onClose={() => setShopOpen(false)}
        userGems={userGems}
        onAddGems={handleAddGems}
        subscriptionTier={subscriptionTier}
        onActivateSubscription={handleActivateSubscription}
        ownedItems={ownedItems}
        onPurchaseItem={handlePurchaseItem}
        streakCount={streakCount}
        adsWatchedToday={adsWatchedToday}
        initialTab={shopInitialTab}
      />

      <DailyRewardModal
        isOpen={rewardOpen}
        onClose={() => setRewardOpen(false)}
        onClaimReward={handleClaimDailyReward}
        alreadyClaimed={alreadyClaimedDaily}
        subscriptionTier={subscriptionTier}
        streakCount={streakCount}
      />

      <AdBannerModal
        isOpen={adOpen}
        onClose={() => setAdOpen(false)}
        subscriptionTier={subscriptionTier}
        adsWatchedToday={adsWatchedToday}
        onAdWatched={() => {
          const watchedToday = dailyCount('fn_ads_today', 'fn_ads_last_date') + 1;
          if (
            readTier() === 'vip' ||
            watchedToday > 3 ||
            Date.now() - readNumber('fn_last_ad_time') < 180000
          )
            return;
          const gems = 20;
          localStorage.setItem('fn_last_ad_time', String(Date.now()));
          setAdsWatchedToday(watchedToday);
          localStorage.setItem('fn_ads_today', watchedToday.toString());
          localStorage.setItem('fn_ads_last_date', new Date().toDateString());
          handleAddGems(gems);
          showToast(`Thank you for watching! Earned +${gems} Gems`);
        }}
      />

      <WorldExtras
        engine={engineRef.current}
        subscriptionTier={subscriptionTier}
        ownedItems={ownedItems}
        revision={economyRevision}
        onToast={showToast}
      />
      <OnboardingFlow
        onOpenReward={() => setRewardOpen(true)}
        canPublish={canPublish}
        alreadyClaimed={alreadyClaimedDaily}
      />

      {engineRef.current && (
        <Minimap
          viewport={minimapViewport}
          chunks={minimapChunks}
          onTeleport={handleMinimapTeleport}
        />
      )}

      {/* Hidden file input for world import */}
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Toast notification */}
      {toast && (
        <div className="fn-toast" key={toast}>
          {toast}
        </div>
      )}
    </div>
  );
}
