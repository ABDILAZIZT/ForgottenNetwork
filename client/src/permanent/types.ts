export type Tool =
  | 'pan'
  | 'brush'
  | 'pixel'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'image'
  | 'sticker'
  | 'stamp'
  | 'eraser'
  | 'export';
export type Point = [number, number];
export interface Content {
  color: string;
  opacity: number;
  size: number;
  points?: Point[];
  text?: string;
  font?: string;
  assetId?: string;
  sticker?: string;
  animated?: boolean;
}
export interface Placement {
  id: string;
  type: Exclude<Tool, 'pan' | 'eraser' | 'export'>;
  x: number;
  y: number;
  width: number;
  height: number;
  content: Content;
}
export interface Artwork extends Placement {
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  ownerAvatar?: string;
  timestamp: string;
  zIndex: number;
  cells: Point[];
  reactions?: Reaction[];
}
export interface Identity {
  id: string;
  name: string;
  color: string;
  avatarId?: string;
  streak: number;
  daysActive: number;
}
export interface Profile extends Identity {
  elements: number;
  pixels: number;
  images: number;
  neighbors: number;
  largestArea: number;
  badges: string[];
  last: Artwork | null;
  xp: number;
  challengeDone: boolean;
}
export interface View {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom?: number;
}
export interface Peer {
  view?: View;
  id: string;
  connectionId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  drawing: boolean;
  authenticated?: boolean;
  avatarId?: string;
}
export interface Reaction {
  kind: 'heart' | 'fire' | 'star';
  count: number;
}
export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  color: string;
  body: string;
  timestamp: string;
}
export interface Notice {
  kind: string;
  timestamp: string;
  name: string;
  color: string;
  elementId: string;
  x: number;
  y: number;
}
export interface Stats {
  artworks: number;
  pixels: number;
  artists: number;
  online: number;
  leaderboard: Array<{ id: string; name: string; color: string; pixels: number; elements: number }>;
  density: Array<{ x: number; y: number; cells: number }>;
  spotlight: Artwork | null;
  challenge: View & { day: string; xp: number };
}
export interface Asset {
  id: string;
  width: number;
  height: number;
  url: string;
  mime?: string;
}
export interface Blocked {
  cx: number;
  cy: number;
  ownerName: string;
  ownerId: string;
}
