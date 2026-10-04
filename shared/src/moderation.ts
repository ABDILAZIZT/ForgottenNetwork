import type {
  AuditEventId,
  Bounds,
  EntityId,
  IsoDateString,
  OperationId,
  ReportId,
  UserId,
  WorldId,
} from './common';

export type ReportCategory =
  | 'illegal'
  | 'harassment'
  | 'sexual_content'
  | 'personal_information'
  | 'spam'
  | 'vandalism'
  | 'other';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type ModerationAction =
  | 'hide_entity'
  | 'restore_entity'
  | 'restore_region'
  | 'suspend_publishing'
  | 'reinstate_publishing';

export type ReportTarget =
  { type: 'entity'; entityId: EntityId } | { type: 'region'; worldId: WorldId; bounds: Bounds };

export interface CreateReportRequest {
  operationId: OperationId;
  target: ReportTarget;
  category: ReportCategory;
  explanation?: string;
}

export interface Report {
  id: ReportId;
  reporterId: UserId | null;
  target: ReportTarget;
  category: ReportCategory;
  explanation: string | null;
  status: ReportStatus;
  createdAt: IsoDateString;
  resolvedAt: IsoDateString | null;
}

export interface CreateModerationActionRequest {
  operationId: OperationId;
  action: ModerationAction;
  reason: string;
  reportId?: ReportId;
  targetUserId?: UserId;
  targetEntityId?: EntityId;
  targetRegion?: { worldId: WorldId; bounds: Bounds; restoreTo: IsoDateString };
}

export interface AuditEvent {
  id: AuditEventId;
  actorId: UserId;
  action: ModerationAction;
  reason: string;
  reportId: ReportId | null;
  target: Record<string, unknown>;
  createdAt: IsoDateString;
}
