import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Sparkles, Image as ImageIcon } from 'lucide-react';
import { EntityType } from '../engine/Entity';
import { useWorldRepository } from '../repositories';

export interface CustomEntityConfig {
  type: EntityType;
  url: string;
  color: string;
  scale: number;
  glow: boolean;
  flicker: boolean;
  bobbing: boolean;
  breathing: boolean;
}

interface Props {
  onClose: () => void;
  onManifest: (config: CustomEntityConfig) => void;
}

export default function EntityCreatorModal({ onClose, onManifest }: Props) {
  const repository = useWorldRepository();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'source' | 'configure'>('source');

  // Entity State
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isGif, setIsGif] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const resolve = async () => {
      if (!sourceUrl) return;
      if (sourceUrl.startsWith('asset:')) {
        const assetId = sourceUrl.replace('asset:', '');
        const asset = await repository.loadAsset(assetId);
        if (asset && active) {
          objectUrl = typeof asset.blob === 'string' ? asset.blob : URL.createObjectURL(asset.blob);
          setPreviewUrl(objectUrl);
        }
      } else {
        setPreviewUrl(sourceUrl);
      }
    };

    resolve();
    return () => {
      active = false;
      if (objectUrl && !sourceUrl?.startsWith('data:')) URL.revokeObjectURL(objectUrl);
    };
  }, [repository, sourceUrl]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      window.alert('File is too large! Please upload under 10MB.');
      return;
    }

    const isGifFile = file.type === 'image/gif';
    const assetId = `asset_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      await repository.saveAsset(assetId, file, file.type);
      setSourceUrl(`asset:${assetId}`);
      setIsGif(isGifFile);
      setStep('configure');
    } catch (err) {
      console.error('Failed to upload asset', err);
    }
  };

  const handleManifest = () => {
    if (!sourceUrl) return;
    onManifest({
      type: isGif ? 'gif_entity' : 'uploaded_custom',
      url: sourceUrl,
      color: '#00e6b8',
      scale: 1,
      glow: false,
      flicker: false,
      bobbing: false,
      breathing: false,
    });
  };

  return (
    <div className="fn-modal-overlay">
      <div className="fn-modal" style={{ width: '450px', maxWidth: '95vw' }}>
        <div className="fn-modal-header">
          <h2>
            <Sparkles size={16} /> MEDIA MANIFESTOR
          </h2>
          <button className="fn-btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="fn-modal-body">
          {step === 'source' && (
            <div className="fn-source-selection">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                <button className="fn-btn-huge" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon size={32} />
                  <span>Upload Image</span>
                  <small>PNG / WEBP / JPG</small>
                </button>

                <button className="fn-btn-huge" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={32} />
                  <span>Upload Animated GIF</span>
                  <small>Looping digital life</small>
                </button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleFileUpload}
              />
            </div>
          )}

          {step === 'configure' && (
            <div className="fn-configure-mode">
              <div className="fn-preview-area">
                <div className="preview-container">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      style={{
                        maxWidth: '200px',
                        maxHeight: '200px',
                        imageRendering: 'pixelated',
                      }}
                    />
                  ) : (
                    <div style={{ padding: '40px', color: 'var(--text-dim)' }}>
                      PREPARING MEDIA...
                    </div>
                  )}
                </div>
              </div>

              <div className="fn-modal-actions">
                <button className="fn-btn" onClick={() => setStep('source')}>
                  Back
                </button>
                <button className="fn-btn fn-btn-primary" onClick={handleManifest}>
                  Manifest to World
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
