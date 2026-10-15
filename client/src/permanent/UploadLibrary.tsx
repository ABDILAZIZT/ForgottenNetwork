import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, Check } from 'lucide-react';
import { api } from './api';
import { mediaSource } from './art';
import type { Asset } from './types';

function Thumbnail({ asset }: { asset: Asset }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void mediaSource(asset.id, true)
        .then((url) => {
          if (active) setSrc(url);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    });
    if (ref.current) observer.observe(ref.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [asset.id]);
  return (
    <span className="pw-upload-thumbnail" ref={ref}>
      {src ? <img src={src} alt="" /> : failed ? 'Preview unavailable' : <ImagePlus size={22} />}
    </span>
  );
}

export default function UploadLibrary({
  token,
  revision,
  selectedId,
  onChoose,
  onUpload,
  busy,
  error,
  phase,
}: {
  token: string;
  revision: number;
  selectedId?: string;
  onChoose: (asset: Asset) => Promise<void>;
  onUpload: () => void;
  busy: boolean;
  error: string;
  phase: string;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(12);
  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setAssets((await api<{ assets: Asset[] }>('/assets', token)).assets);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void refresh();
  }, [refresh, revision]);
  return (
    <section className="pw-upload-library" aria-label="My images and GIFs" aria-busy={busy}>
      <button className="pw-upload-dropzone" disabled={busy} onClick={onUpload}>
        {busy ? <Loader2 className="pw-upload-spinner" size={24} /> : <ImagePlus size={26} />}
        <strong>{busy ? phase || 'Preparing image…' : 'Add image or GIF'}</strong>
        <span>{busy ? 'Keep this tab open' : 'Choose a file, drop it here, or paste'}</span>
      </button>
      <small
        className="pw-muted"
        title="Photos resize automatically to 2048px. GIFs support up to 120 frames and 16 million decoded pixels."
      >
        PNG, JPG, WebP, GIF · 8 MB max
      </small>
      {(error || loadError) && (
        <p className="pw-upload-error" role="alert">
          {error || loadError}
        </p>
      )}
      <div className="pw-upload-heading">
        <strong>Your uploads</strong>
        <button
          className="pw-icon"
          title="Refresh uploads"
          aria-label="Refresh uploads"
          disabled={loading || busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {loading && !assets.length && <p role="status">Loading your uploads…</p>}
      {!assets.length && !loading && (
        <p className="pw-muted">
          Your images will appear here. Uploads stay private until you publish.
        </p>
      )}
      <div className="pw-upload-grid">
        {assets.slice(0, limit).map((asset) => (
          <button
            key={asset.id}
            className={'pw-upload-tile ' + (selectedId === asset.id ? 'selected' : '')}
            disabled={busy || asset.moderationState === 'rejected'}
            aria-label={`Select ${asset.mime === 'image/gif' ? 'GIF' : 'image'}, ${asset.width} by ${asset.height}${asset.moderationState === 'rejected' ? ', unavailable' : ''}`}
            aria-pressed={selectedId === asset.id}
            onClick={() => void onChoose(asset)}
          >
            {asset.moderationState === 'rejected' ? (
              <span className="pw-upload-thumbnail">Unavailable</span>
            ) : (
              <Thumbnail key={revision} asset={asset} />
            )}
            {asset.mime === 'image/gif' && <span className="pw-upload-badge">GIF</span>}
            {selectedId === asset.id && <Check className="pw-upload-selected" size={16} />}
            <small>
              {asset.width} × {asset.height}
            </small>
          </button>
        ))}
      </div>
      {assets.length > limit && (
        <button disabled={busy} onClick={() => setLimit((n) => n + 12)}>
          Show more
        </button>
      )}
    </section>
  );
}
