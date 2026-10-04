export type IsoDateString = string;
export type UserId = string;
export type WorldId = string;
export type RegionId = string;
export type EntityId = string;
export type AssetId = string;
export type OperationId = string;
export type ReportId = string;
export type AuditEventId = string;

export type UserRole = 'member' | 'moderator' | 'administrator';

export interface PublicUser {
  id: UserId;
  displayName: string;
  avatarUrl: string | null;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
