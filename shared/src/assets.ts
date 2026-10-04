import type { AssetId, IsoDateString, OperationId, UserId } from './common';

export type AcceptedMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
export type AssetStatus = 'pending_upload' | 'processing' | 'ready' | 'rejected' | 'deleted';

export interface Asset {
  id: AssetId;
  ownerId: UserId;
  status: AssetStatus;
  mediaType: AcceptedMediaType;
  byteSize: number;
  width: number | null;
  height: number | null;
  frameCount: number | null;
  durationMs: number | null;
  publicUrl: string | null;
  thumbnailUrl: string | null;
  rejectionReason: string | null;
  createdAt: IsoDateString;
  readyAt: IsoDateString | null;
}

export interface CreateAssetUploadRequest {
  operationId: OperationId;
  fileName: string;
  declaredMediaType: AcceptedMediaType;
  byteSize: number;
}

export interface CreateAssetUploadResponse {
  asset: Asset;
  upload: {
    url: string;
    method: 'PUT';
    headers: Record<string, string>;
    expiresAt: IsoDateString;
  };
}
