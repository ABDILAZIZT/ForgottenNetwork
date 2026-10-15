import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Asset } from './types';

export default function UploadLibrary({
  token,
  revision,
  arabic,
  onChoose,
  onUpload,
  busy,
}: {
  token: string;
  revision: number;
  arabic: boolean;
  onChoose: (asset: Asset) => void;
  onUpload: () => void;
  busy: boolean;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setAssets((await api<{ assets: Asset[] }>('/assets', token)).assets);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void refresh();
  }, [refresh, revision]);
  return (
    <section
      className="pw-upload-library"
      aria-label={arabic ? 'صوري وملفات GIF' : 'My images and GIFs'}
    >
      <button disabled={busy} onClick={onUpload}>
        {arabic ? 'رفع صورة أو GIF' : 'Upload image or GIF'}
      </button>
      <button disabled={loading} onClick={() => void refresh()}>
        {arabic ? 'تحديث حالة الصور' : 'Refresh upload status'}
      </button>
      <p>
        {arabic
          ? 'تظهر الصور بعد موافقة المشرف. يمكنك اختيار الصورة المعتمدة هنا دون رفعها مرة أخرى.'
          : 'Uploads need moderator approval. Choose an approved image here without uploading it again.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {!assets.length && !loading && (
        <p>{arabic ? 'لا توجد صور مرفوعة بعد.' : 'No uploads yet.'}</p>
      )}
      {assets.map((asset) => (
        <div key={asset.id}>
          {asset.moderationState === 'approved' && (
            <img
              src={'/api/canvas/assets/' + asset.id}
              alt=""
              width={64}
              height={64}
              loading="lazy"
            />
          )}
          <span>
            {asset.mime === 'image/gif' ? 'GIF' : arabic ? 'صورة' : 'Image'} · {asset.width} ×{' '}
            {asset.height}
          </span>
          {asset.moderationState === 'approved' ? (
            <button onClick={() => onChoose(asset)}>
              {arabic ? 'وضع على اللوحة' : 'Place on canvas'}
            </button>
          ) : (
            <strong>
              {asset.moderationState === 'pending'
                ? arabic
                  ? 'تم الرفع · بانتظار المراجعة'
                  : 'Uploaded · awaiting review'
                : arabic
                  ? 'غير متاحة للنشر'
                  : 'Unavailable for publishing'}
            </strong>
          )}
        </div>
      ))}
      <a href="/safety">{arabic ? 'متابعة المراجعة' : 'Review details'}</a>
    </section>
  );
}
