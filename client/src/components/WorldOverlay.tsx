import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  Brush,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  Eraser,
  Gift,
  Hand,
  Image as ImageIcon,
  Lock,
  PaintBucket,
  Pipette,
  ShoppingBag,
  Shuffle,
  Trash2,
  Tv,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { DrawTool } from '../engine/Engine';
import { EntityType } from '../engine/Entity';
import { useWorldRepository } from '../repositories';
import type { RepositoryStatus } from '../repositories';
import type { SessionUser } from '../auth';
import SubscriptionBadge, { type SubscriptionTier } from './SubscriptionBadge';
import { dailyCount } from '../economy';
import { colorCube, THEMES } from '../palettes';

const TOOLS: { id: DrawTool; icon: ReactNode; label: string }[] = [
  { id: 'pan', icon: <Hand size={17} />, label: 'Navigate [V]' },
  { id: 'brush', icon: <Brush size={17} />, label: 'Brush [B]' },
  { id: 'eraser', icon: <Eraser size={17} />, label: 'Eraser [E]' },
  { id: 'fill', icon: <PaintBucket size={17} />, label: 'Fill [F]' },
  { id: 'pipette', icon: <Pipette size={17} />, label: 'Pick color [I]' },
  { id: 'spawn', icon: <ImageIcon size={17} />, label: 'Place media [O]' },
  { id: 'delete_entity', icon: <Trash2 size={17} />, label: 'Remove media [X]' },
];

const LAYER_NAMES = ['Background', 'Main', 'Overlay'];

const PALETTE = [
  '#ffffff',
  '#000000',
  '#ff4466',
  '#ff9933',
  '#ffee33',
  '#44ff88',
  '#00e6b8',
  '#3388ff',
  '#aa44ff',
  '#ff44cc',
  '#aabbcc',
  '#223344',
  '#ff6644',
  '#88ffee',
  '#ffaadd',
  '#005533',
];

interface Props {
  coordX: number;
  coordY: number;
  zoom: number;
  tool: DrawTool;
  layer: number;
  brushSize: number;
  color: string;
  onToolChange: (t: DrawTool) => void;
  onLayerChange: (l: number) => void;
  onBrushSizeChange: (s: number) => void;
  onColorChange: (c: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTeleport: () => void;
  onUndo: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSpawnTypeChange: (type: EntityType, presetId: string | null) => void;
  onSpawnScaleChange: (scale: number) => void;
  selectedPresetId: string | null;
  spawnScale: number;
  repositoryStatus: RepositoryStatus;
  currentUser: SessionUser | null;
  authEnabled: boolean;
  authLoading: boolean;
  canPublish: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  userGems?: number;
  subscriptionTier: SubscriptionTier;
  ownedItems: string[];
  brushStyle: 'solid' | 'spray';
  onBrushStyleChange: (style: 'solid' | 'spray') => void;
  adsWatchedToday: number;
  alreadyClaimedDaily: boolean;
  onOpenShop?: (tab?: 'subscriptions' | 'bundles' | 'items' | 'rewards') => void;
  onOpenReward?: () => void;
  onOpenAd?: () => void;
}

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export default function WorldOverlay({
  coordX,
  coordY,
  zoom,
  tool,
  layer,
  brushSize,
  color,
  onToolChange,
  onLayerChange,
  onBrushSizeChange,
  onColorChange,
  onZoomIn,
  onZoomOut,
  onTeleport,
  onUndo,
  onSave,
  onLoad,
  onSpawnTypeChange,
  onSpawnScaleChange,
  selectedPresetId,
  spawnScale,
  repositoryStatus,
  currentUser,
  authEnabled,
  authLoading,
  canPublish,
  onSignIn,
  onSignOut,
  userGems = 100,
  subscriptionTier,
  ownedItems,
  brushStyle,
  onBrushStyleChange,
  adsWatchedToday,
  alreadyClaimedDaily,
  onOpenShop,
  onOpenReward,
  onOpenAd,
}: Props) {
  const repository = useWorldRepository();
  const [drawOpen, setDrawOpen] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [upsell, setUpsell] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [palette, setPalette] = useState('basic');
  const [hexDraft, setHexDraft] = useState(color);
  const upsellTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setHexDraft(color), [color]);
  useEffect(() => () => clearTimeout(upsellTimer.current), []);
  const [shopVisited, setShopVisited] = useState(
    () => localStorage.getItem('fn_shop_visited') === 'true',
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDrawTool = tool === 'brush' || tool === 'eraser' || tool === 'fill' || tool === 'pipette';
  const showOptions = isDrawTool || tool === 'spawn';
  const canRetry = repositoryStatus.phase === 'retry' || repositoryStatus.phase === 'error';
  const hasConflict = ['conflict', 'retry', 'rejected', 'error'].includes(repositoryStatus.phase);
  const isPaid = subscriptionTier === 'artist' || subscriptionTier === 'vip';
  const boostActive = Number(localStorage.getItem('fn_brush_boost_until') || '0') > Date.now();
  const brushMax = isPaid ? 24 : boostActive ? 8 : 4;
  const remainingAds = subscriptionTier === 'vip' ? 0 : Math.max(0, 3 - adsWatchedToday);
  const paletteOptions = [
    ['basic', 'Classic'],
    ...(isPaid ? [['extended', subscriptionTier === 'vip' ? 'Spectrum 256' : 'Spectrum 64']] : []),
    ...Object.keys(THEMES)
      .filter(
        (key) =>
          ownedItems.includes(key) || (subscriptionTier === 'vip' && !key.startsWith('palette_')),
      )
      .map((key) => [key, key.replace('palette_', '').replace(/_/g, ' ')]),
  ];
  const activePalette = paletteOptions.some(([key]) => key === palette) ? palette : 'basic';
  const colors =
    activePalette === 'basic'
      ? PALETTE
      : activePalette === 'extended'
        ? colorCube(subscriptionTier === 'vip')
        : THEMES[activePalette];

  const useServerVersion = async () => {
    const confirmed = window.confirm(
      'Discard unsent local changes and reload the latest server world? This cannot be undone.',
    );
    if (!confirmed) return;
    await repository.discardPending();
    window.location.reload();
  };

  const handleColorInput = (value: string) => {
    setHexDraft(value);
    const normalized = value.startsWith('#') ? value : `#${value}`;
    if (isHexColor(normalized)) onColorChange(normalized.toLowerCase());
  };

  const showUpsell = (message: string) => {
    clearTimeout(upsellTimer.current);
    setUpsell(message);
    upsellTimer.current = setTimeout(() => setUpsell(null), 5000);
  };

  const openShop = (tab: 'subscriptions' | 'bundles' | 'items' | 'rewards' = 'subscriptions') => {
    setShopVisited(true);
    localStorage.setItem('fn_shop_visited', 'true');
    onOpenShop?.(tab);
  };

  const handleLayerClick = (nextLayer: number) => {
    if (!isPaid && (nextLayer === 0 || nextLayer === 2)) {
      showUpsell(
        `${LAYER_NAMES[nextLayer]} layer unlocked with Cyber Artist Pass - Tap to upgrade`,
      );
      return;
    }
    onLayerChange(nextLayer);
  };

  const handleBrushSize = (nextSize: number) => {
    if (!isPaid && !boostActive && nextSize > 4) {
      showUpsell('Larger brushes unlocked with Cyber Artist Pass - Tap to upgrade');
      return;
    }
    onBrushSizeChange(Math.min(nextSize, brushMax));
  };

  const getUploadsToday = () => {
    const today = new Date().toDateString();
    if (localStorage.getItem('fn_uploads_date') !== today) return 0;
    return dailyCount('fn_uploads_today', 'fn_uploads_date');
  };

  const getUploadBonus = () => {
    const today = new Date().toDateString();
    if (localStorage.getItem('fn_upload_bonus_date') !== today) return 0;
    return dailyCount('fn_upload_bonus_today', 'fn_upload_bonus_date');
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    if (!canPublish || processing) {
      e.target.value = '';
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setUploadError('Choose a PNG, JPG, GIF, or WebP image.');
      e.target.value = '';
      return;
    }

    const maxSize =
      subscriptionTier === 'vip'
        ? 25 * 1024 * 1024
        : subscriptionTier === 'artist'
          ? 5 * 1024 * 1024
          : 512 * 1024;
    const baseUploadLimit =
      subscriptionTier === 'vip'
        ? Number.POSITIVE_INFINITY
        : subscriptionTier === 'artist'
          ? 10
          : 3;
    const uploadLimit = baseUploadLimit + getUploadBonus();
    const uploadsToday = getUploadsToday();

    if (file.size > maxSize) {
      if (subscriptionTier === 'vip') {
        setUploadError('This image exceeds the 25MB upload limit.');
        e.target.value = '';
        return;
      }
      showUpsell(
        subscriptionTier === 'free'
          ? 'Uploads over 512KB require Cyber Artist Pass - Tap to upgrade'
          : 'Uploads over 5MB require Cyber VIP Crown - Tap to upgrade',
      );
      e.target.value = '';
      return;
    }
    if (uploadsToday >= uploadLimit) {
      showUpsell(
        subscriptionTier === 'artist'
          ? 'Daily limit reached. Get extra slots in the Gem Shop or upgrade to VIP.'
          : 'Daily limit reached. Get extra slots in the Gem Shop or upgrade to Artist.',
      );
      e.target.value = '';
      return;
    }

    setProcessing(true);
    const type: EntityType = file.type === 'image/gif' ? 'gif_entity' : 'uploaded_custom';
    const assetId = `asset_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        throw new Error('This image could not be decoded. Choose a valid PNG, JPG, GIF, or WebP.');
      }
      const width = bitmap.width,
        height = bitmap.height;
      bitmap.close();
      if (width * height > 16777216) throw new Error('Images are limited to 16 million pixels.');
      if (
        repository.mode === 'remote' &&
        (file.size > 8 * 1024 * 1024 || width > 512 || height > 512)
      ) {
        throw new Error('Shared-world uploads are limited to 8MB and 512 x 512 pixels.');
      }
      await repository.saveAsset(assetId, file, file.type || 'image/png');
      const today = new Date().toDateString();
      localStorage.setItem('fn_uploads_date', today);
      localStorage.setItem('fn_uploads_today', (uploadsToday + 1).toString());
      onSpawnTypeChange(type, `asset:${assetId}`);
    } catch (err) {
      console.error('Failed to save asset', err);
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setProcessing(false);
      e.target.value = '';
    }
  };

  return (
    <div className="fn-overlay">
      <div className="fn-panel fn-header">
        <div className="fn-logo">
          Forgotten<span>Network</span>
        </div>
        <div className="fn-tagline">A LIVING DIGITAL CIVILIZATION</div>
        <div
          className={`fn-repository-status ${repositoryStatus.phase}`}
          title={`${repositoryStatus.message}; ${repositoryStatus.pendingWrites} pending writes`}
          role="status"
        >
          <span aria-hidden="true" />
          {repositoryStatus.message}
          {canRetry && canPublish && (
            <button
              type="button"
              className="fn-retry-sync"
              onClick={() =>
                void repository
                  .retryPending()
                  .then(() => window.location.reload())
                  .catch(() => undefined)
              }
            >
              Retry
            </button>
          )}
          {hasConflict && (
            <button type="button" className="fn-retry-sync" onClick={() => void useServerVersion()}>
              Use server
            </button>
          )}
        </div>
        <div className="fn-header-actions">
          {/* Monetization Badges & Buttons */}
          <button
            className="fn-gems-badge"
            onClick={() => openShop('rewards')}
            title="Open Cyber Market & Gem Log"
          >
            <Coins size={14} className="gems-icon" />
            <span key={userGems} className="gem-count-bounce">
              {userGems}
            </span>
            <SubscriptionBadge tier={subscriptionTier} />
          </button>

          <button
            className={`fn-btn fn-btn-sm fn-gift-btn ${alreadyClaimedDaily ? '' : 'needs-claim'}`}
            title="Daily Login Bonus"
            onClick={onOpenReward}
          >
            <Gift size={14} />
          </button>

          {subscriptionTier !== 'vip' && (
            <button
              className="fn-btn fn-btn-sm fn-ad-btn"
              title="Watch ad for free gems"
              onClick={onOpenAd}
            >
              <Tv size={14} />
              <span className="mini-count">{remainingAds}</span>
            </button>
          )}

          <button
            className={`fn-btn fn-btn-sm fn-shop-btn ${shopVisited ? '' : 'new-shop'}`}
            title="Cyber Market & Shop"
            onClick={() => openShop('subscriptions')}
          >
            <ShoppingBag size={14} />
            {!shopVisited && <span className="new-pill">NEW</span>}
          </button>

          {repository.mode === 'remote' &&
            (currentUser ? (
              <button className="fn-auth-button" type="button" onClick={onSignOut} title="Sign out">
                {currentUser.displayName}
              </button>
            ) : authEnabled ? (
              <button
                className="fn-auth-button"
                type="button"
                onClick={onSignIn}
                disabled={authLoading}
              >
                {authLoading ? 'CHECKING…' : 'SIGN IN'}
              </button>
            ) : (
              <button
                className="fn-auth-button"
                type="button"
                disabled={authLoading}
                onClick={async () => {
                  try {
                    const identity = JSON.parse(
                      localStorage.getItem('fn_canvas_identity') || 'null',
                    );
                    if (!identity?.token) {
                      location.assign('/');
                      return;
                    }
                    const response = await fetch('/api/canvas/classic-session', {
                      method: 'POST',
                      credentials: 'include',
                      headers: {
                        Authorization: 'Bearer ' + identity.token,
                        'Content-Type': 'application/json',
                      },
                      body: '{}',
                    });
                    if (!response.ok) {
                      const result = await response.json();
                      window.alert(result.error?.message || 'Could not sign in.');
                      return;
                    }
                    location.reload();
                  } catch {
                    window.alert('Could not connect. Your saved work has not changed.');
                  }
                }}
              >
                SIGN IN WITH ARTIST IDENTITY
              </button>
            ))}
          <button className="fn-btn fn-btn-sm" title="Save world [Ctrl+S]" onClick={onSave}>
            <Download size={14} />
          </button>
          <button
            className="fn-btn fn-btn-sm"
            title="Load world"
            onClick={onLoad}
            disabled={!canPublish}
          >
            <Upload size={14} />
          </button>
          <button
            className="fn-btn fn-btn-sm"
            title="Undo [Ctrl+Z]"
            onClick={onUndo}
            disabled={!canPublish}
          >
            <Undo2 size={14} />
          </button>
        </div>
      </div>

      <div className="fn-coords">
        <div>
          X: {coordX.toString().padStart(6, '\u00A0')} Y: {coordY.toString().padStart(6, '\u00A0')}
        </div>
        <div>
          ZOOM: {zoom.toFixed(2)}x | LAYER: {LAYER_NAMES[layer] ?? layer}
        </div>
      </div>

      <div className="fn-panel fn-toolbar">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            className={`fn-btn${tool === item.id ? ' active' : ''}`}
            title={item.label}
            onClick={() => onToolChange(item.id)}
            disabled={
              !canPublish &&
              (item.id === 'brush' ||
                item.id === 'eraser' ||
                item.id === 'fill' ||
                item.id === 'spawn' ||
                item.id === 'delete_entity')
            }
          >
            {item.icon}
          </button>
        ))}

        <div className="fn-sep" />

        <button className="fn-btn" title="Zoom in [+]" onClick={onZoomIn}>
          <ZoomIn size={17} />
        </button>
        <button className="fn-btn" title="Zoom out [-]" onClick={onZoomOut}>
          <ZoomOut size={17} />
        </button>

        <div className="fn-sep" />

        <button className="fn-btn" title="Teleport" onClick={onTeleport}>
          <Shuffle size={17} />
        </button>

        {showOptions && (
          <button
            className="fn-btn"
            title={drawOpen ? 'Hide options' : 'Show options'}
            onClick={() => setDrawOpen((open) => !open)}
          >
            {drawOpen ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        )}
      </div>

      {isDrawTool && drawOpen && (
        <div className="fn-panel fn-draw-panel">
          <div>
            <div className="fn-label">Layer</div>
            <div className="fn-layer-buttons">
              {LAYER_NAMES.map((name, index) => (
                <button
                  key={name}
                  className={`layer-btn ${layer === index ? 'active' : ''} ${
                    !isPaid && (index === 0 || index === 2) ? 'locked' : ''
                  }`}
                  type="button"
                  onClick={() => handleLayerClick(index)}
                >
                  {name}
                  {!isPaid && (index === 0 || index === 2) && <Lock size={11} />}
                </button>
              ))}
            </div>
          </div>

          {(tool === 'brush' || tool === 'eraser') && (
            <div>
              <div className="fn-label">
                Brush Size: {brushSize}px {brushMax <= 4 && <Lock size={11} />}
              </div>
              <input
                className="fn-range"
                type="range"
                aria-label="Brush size"
                min={1}
                max={isPaid ? 24 : 8}
                step={1}
                value={brushSize}
                onChange={(e) => handleBrushSize(Number(e.target.value))}
              />
            </div>
          )}
          {tool === 'brush' &&
            (subscriptionTier === 'vip' || ownedItems.includes('spray_brush')) && (
              <label className="fn-label">
                Brush style
                <select
                  className="fn-layer-select"
                  aria-label="Brush style"
                  value={brushStyle}
                  onChange={(event) => onBrushStyleChange(event.target.value as 'solid' | 'spray')}
                >
                  <option value="solid">Solid</option>
                  <option value="spray">Spray</option>
                </select>
              </label>
            )}

          {tool !== 'eraser' && (
            <div>
              <div className="fn-label">Color</div>
              <div className="fn-color-row">
                <input
                  className="fn-color-swatch"
                  type="color"
                  value={isHexColor(color) ? color : '#ffffff'}
                  onChange={(e) => onColorChange(e.target.value)}
                  title="Current color"
                  disabled={!isPaid}
                />
                <input
                  className="fn-color-input"
                  value={hexDraft}
                  spellCheck={false}
                  onChange={(e) => handleColorInput(e.target.value)}
                  title="Hex color"
                  disabled={!isPaid}
                  onBlur={() => setHexDraft(color)}
                />
              </div>
              <select
                className="fn-layer-select"
                aria-label="Color palette"
                value={activePalette}
                onChange={(event) => setPalette(event.target.value)}
              >
                {paletteOptions.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
              <div className="fn-palette">
                {colors.map((swatch) => (
                  <button
                    key={swatch}
                    className={`fn-swatch${swatch === color ? ' selected' : ''}`}
                    style={{ background: swatch }}
                    title={swatch}
                    onClick={() => onColorChange(swatch)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tool === 'spawn' && drawOpen && (
        <div className="fn-panel fn-spawn-hub scroll-y">
          <div className="hub-section">
            {uploadError && (
              <p role="alert" className="fn-upload-error">
                {uploadError}
              </p>
            )}
            <div className="fn-label">Media Asset</div>
            <div className="media-compact">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleFileUpload}
              />
              <button
                className={`compact-btn ${selectedPresetId ? 'active' : ''} ${processing ? 'loading' : ''}`}
                onClick={() => !processing && fileInputRef.current?.click()}
                title="Upload PNG, JPG, or GIF"
                disabled={processing || !canPublish}
              >
                <ImageIcon size={18} />
                <span>{processing ? '...' : selectedPresetId ? 'READY' : 'UPLOAD'}</span>
              </button>

              {selectedPresetId && (
                <button
                  className="compact-btn clear"
                  onClick={() => onSpawnTypeChange('creature', null)}
                  title="Clear selection"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            {selectedPresetId && <div className="manifest-hint">Click world to place media</div>}
          </div>

          <div className="fn-sep" />

          <div className="hub-section">
            <div className="fn-label">Scale</div>
            <div className="scale-control">
              <input
                type="range"
                min={0.2}
                max={8}
                step={0.1}
                value={spawnScale}
                onChange={(e) => onSpawnScaleChange(Number(e.target.value))}
                className="fn-range"
              />
              <div className="scale-readout">{spawnScale.toFixed(1)}x</div>
            </div>
          </div>
        </div>
      )}

      {upsell && (
        <div className="fn-upsell-tooltip">
          <span>{upsell}</span>
          <button onClick={() => openShop('subscriptions')}>Upgrade</button>
        </div>
      )}

      <style>{`
        .scroll-y { overflow-y: auto; }
        .fn-spawn-hub {
          position: absolute;
          top: 50%;
          right: 74px;
          transform: translateY(-50%);
          width: 208px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 12px;
          background: rgba(10, 10, 15, 0.95) !important;
          border: 1px solid rgba(0, 230, 184, 0.2) !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .media-compact {
          display: flex;
          gap: 6px;
          margin-top: 6px;
        }
        .compact-btn {
          flex: 1;
          height: 34px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
        }
        .compact-btn:hover { background: rgba(255,255,255,0.1); }
        .compact-btn.active {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(0,230,184,0.05);
        }
        .compact-btn.clear {
          flex: 0 0 34px;
          color: #ff4466;
          border-color: rgba(255,68,102,0.2);
        }
        .compact-btn span {
          font-size: 0.6rem;
          font-weight: 700;
        }
        .compact-btn.loading {
          opacity: 0.7;
          cursor: wait;
          border-color: var(--accent);
          animation: pulse-border 1.5s infinite;
        }
        @keyframes pulse-border {
          0% { border-color: rgba(0, 230, 184, 0.2); }
          50% { border-color: rgba(0, 230, 184, 1); box-shadow: 0 0 10px rgba(0, 230, 184, 0.2); }
          100% { border-color: rgba(0, 230, 184, 0.2); }
        }
        .manifest-hint {
          font-size: 0.62rem;
          color: var(--accent);
          text-align: center;
          margin-top: 8px;
          opacity: 0.85;
        }
        .scale-control {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }
        .scale-readout {
          font-family: 'JetBrains Mono', monospace;
          color: var(--accent);
          font-size: 0.75rem;
          min-width: 36px;
          text-align: right;
        }
        .fn-gems-badge {
          background: rgba(0, 230, 184, 0.1);
          border: 1px solid rgba(0, 230, 184, 0.3);
          color: #00e6b8;
          padding: 4px 10px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Outfit', system-ui, sans-serif;
        }
        .fn-gems-badge:hover {
          background: rgba(0, 230, 184, 0.2);
          box-shadow: 0 0 10px rgba(0, 230, 184, 0.3);
        }
        .gems-icon { color: #3388ff; }
        .vip-badge-icon { color: #ffaa00; margin-left: 2px; }
        .gem-count-bounce {
          display: inline-block;
          animation: gem-bounce 260ms ease;
        }
        .fn-gift-btn { color: #ffaa00 !important; border-color: rgba(255, 170, 0, 0.3) !important; }
        .fn-gift-btn:hover { background: rgba(255, 170, 0, 0.15) !important; }
        .fn-gift-btn.needs-claim::after {
          content: '';
          position: absolute;
          top: 4px;
          right: 4px;
          width: 7px;
          height: 7px;
          background: #ffaa00;
          border-radius: 999px;
          box-shadow: 0 0 8px rgba(255, 170, 0, 0.8);
          animation: dot-pulse 1.4s ease-in-out infinite;
        }
        .fn-ad-btn { position: relative; color: #3388ff !important; border-color: rgba(51, 136, 255, 0.3) !important; }
        .fn-ad-btn:hover { background: rgba(51, 136, 255, 0.15) !important; }
        .mini-count {
          position: absolute;
          right: -5px;
          top: -6px;
          min-width: 16px;
          height: 16px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: #3388ff;
          color: #fff;
          font-size: 0.62rem;
          font-weight: 900;
        }
        .fn-shop-btn { color: #00e6b8 !important; border-color: rgba(0, 230, 184, 0.3) !important; }
        .fn-shop-btn:hover { background: rgba(0, 230, 184, 0.15) !important; }
        .new-pill {
          position: absolute;
          left: 50%;
          bottom: -15px;
          transform: translateX(-50%);
          color: #03110e;
          background: #00e6b8;
          border-radius: 999px;
          padding: 1px 5px;
          font: 900 0.52rem 'Outfit', system-ui, sans-serif;
        }
        .fn-layer-buttons {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 5px;
          margin-top: 6px;
        }
        .layer-btn {
          min-height: 30px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 5px;
          background: rgba(255,255,255,0.03);
          color: #94a3b8;
          font: 800 0.64rem 'Outfit', system-ui, sans-serif;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .layer-btn.active {
          color: #00e6b8;
          border-color: rgba(0,230,184,0.4);
          background: rgba(0,230,184,0.1);
        }
        .layer-btn.locked {
          opacity: 0.45;
        }
        .fn-upsell-tooltip {
          position: fixed;
          top: 50%;
          left: 96px;
          z-index: 1002;
          width: 250px;
          padding: 11px;
          border-radius: 8px;
          border: 1px solid rgba(0,230,184,0.3);
          background: rgba(13,14,23,0.96);
          color: #e2e8f0;
          box-shadow: 0 0 20px rgba(0,230,184,0.25);
          font-family: 'Outfit', system-ui, sans-serif;
          animation: upsell-pop 180ms ease;
        }
        .fn-upsell-tooltip span {
          display: block;
          font-size: 0.78rem;
          line-height: 1.35;
          margin-bottom: 8px;
        }
        .fn-upsell-tooltip button {
          border: 0;
          background: #00e6b8;
          color: #03110e;
          border-radius: 5px;
          padding: 6px 9px;
          font-weight: 900;
          cursor: pointer;
        }
        @keyframes gem-bounce {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-4px) scale(1.08); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes dot-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.45); opacity: 0.65; }
        }
        @keyframes upsell-pop {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
