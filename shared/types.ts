export const COLS = 13;
export const ROWS = 11;
export const ROUND_MS = 120_000;
export const FUSE_MS = 2_500;
export const FLAME_MS = 500;
export const STEP_MS = 200;
export const RECONNECT_MS = 10_000;
export const PLAYER_COLORS = ['#b8ed69', '#a996ff', '#ffbe66', '#68dce6'];
export const SPAWNS = [{ x: 1, y: 1 }, { x: 11, y: 9 }, { x: 11, y: 1 }, { x: 1, y: 9 }];

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Tile = 0 | 1 | 2; // floor, wall, crate
export type Phase = 'lobby' | 'countdown' | 'playing' | 'results';
export type Buff = 'speed' | 'range';
export interface Player {
  id: string;
  name: string;
  slot: number;
  x: number;
  y: number;
  facing: Direction;
  alive: boolean;
  connected: boolean;
  ready: boolean;
  speed: number;
  range: number;
  wins: number;
}
export interface Bomb { id: number; ownerId: string; x: number; y: number; range: number; explodesAt: number }
export interface Flame { x: number; y: number; until: number }
export interface Pickup { x: number; y: number; type: Buff; availableAt: number }
export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  round: number;
  players: Player[];
  grid: Tile[][];
  bombs: Bomb[];
  flames: Flame[];
  pickups: Pickup[];
  startsAt: number;
  endsAt: number;
  serverTime: number;
  winnerId: string | null;
  resultReason: string;
}
export type Reply = { ok: true; code?: string; playerId?: string; token?: string } | { ok: false; error: string };
