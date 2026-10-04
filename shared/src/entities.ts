import type {
  AssetId,
  EntityId,
  IsoDateString,
  OperationId,
  PublicUser,
  UserId,
  WorldId,
} from './common';

export type EntityType =
  | 'creature'
  | 'structure'
  | 'sign'
  | 'hologram'
  | 'ambient_prop'
  | 'floating_object'
  | 'environmental_decoration'
  | 'gif_entity'
  | 'uploaded_custom';

export type EntityBehavior =
  'wander' | 'stationary' | 'follow_light' | 'sleep' | 'group' | 'hide' | 'float' | 'sway';
export type EntityAnchor = 'feet' | 'center';
export type ModerationState = 'visible' | 'hidden' | 'removed';

export interface EntityVisualConfig {
  color?: string;
  glow?: boolean;
  flicker?: boolean;
  scanlines?: boolean;
  hologram?: boolean;
}

export interface Entity {
  id: EntityId;
  worldId: WorldId;
  creator: PublicUser;
  type: EntityType;
  name: string;
  description: string;
  x: number;
  y: number;
  scale: number;
  anchor: EntityAnchor;
  behavior: EntityBehavior;
  assetId: AssetId | null;
  visual: EntityVisualConfig;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface CreateEntityRequest {
  operationId: OperationId;
  type: EntityType;
  name: string;
  description?: string;
  x: number;
  y: number;
  scale: number;
  anchor: EntityAnchor;
  behavior: EntityBehavior;
  assetId?: AssetId;
  visual?: EntityVisualConfig;
}

export type UpdateEntityRequest = Partial<
  Pick<Entity, 'name' | 'description' | 'x' | 'y' | 'scale' | 'behavior' | 'visual'>
> & {
  operationId: OperationId;
  expectedUpdatedAt: IsoDateString;
};

export interface EntityTombstone {
  id: EntityId;
  deletedBy: UserId;
  deletedAt: IsoDateString;
  restoreUntil: IsoDateString;
}
