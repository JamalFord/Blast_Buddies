import { COLS, ROWS, SPAWNS, STEP_MS, FUSE_MS, FLAME_MS, ROUND_MS, type Direction, type Player, type RoomState, type Tile } from '../shared/types.js';

const vectors: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const validDirection = (value: unknown): value is Direction => typeof value === 'string' && Object.hasOwn(vectors, value);
export interface Input { direction: Direction | null; pending?: Direction | null; lastSeen: number; nextMoveAt: number }
export interface GameRoom { state: RoomState; inputs: Map<string, Input>; nextBombId: number; lastActive: number }

export function createMap(): Tile[][] {
  return Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x): Tile => {
    if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 || (x % 2 === 0 && y % 2 === 0)) return 1;
    // Each starting corner has an escape route even if a new player bombs their spawn.
    if (SPAWNS.some(s => Math.abs(s.x - x) + Math.abs(s.y - y) <= 3)) return 0;
    const mx = Math.min(x, COLS - 1 - x), my = Math.min(y, ROWS - 1 - y);
    return (mx * 7 + my * 11) % 5 === 0 ? 0 : 2;
  }));
}

export function createRoom(code: string, hostId: string, now: number): GameRoom {
  return {
    state: { code, hostId, phase: 'lobby', round: 0, players: [], grid: createMap(), bombs: [], flames: [], pickups: [], startsAt: 0, endsAt: 0, serverTime: now, winnerId: null, resultReason: '' },
    inputs: new Map(), nextBombId: 1, lastActive: now,
  };
}

export function addPlayer(room: GameRoom, id: string, name: string): Player {
  const slot = [0, 1, 2, 3].find(n => !room.state.players.some(p => p.slot === n));
  if (slot === undefined) throw new Error('This room is full.');
  const player: Player = { id, name, slot, ...SPAWNS[slot], facing: 'down', alive: true, connected: true, ready: false, speed: 0, range: 2, wins: 0 };
  room.state.players.push(player);
  return player;
}

export function startRound(room: GameRoom, now: number): void {
  const state = room.state;
  state.grid = createMap(); state.bombs = []; state.flames = []; state.pickups = [];
  state.phase = 'countdown'; state.round++; state.startsAt = now + 3_000;
  state.endsAt = state.startsAt + ROUND_MS; state.winnerId = null; state.resultReason = '';
  room.inputs.clear();
  for (const player of state.players) Object.assign(player, SPAWNS[player.slot], { alive: true, speed: 0, range: 2, facing: 'down', ready: false });
}

export function placeBomb(room: GameRoom, playerId: string, now: number): boolean {
  const s = room.state, p = s.players.find(p => p.id === playerId);
  if (s.phase !== 'playing' || !p?.alive || !p.connected || s.bombs.some(b => b.ownerId === playerId || (b.x === p.x && b.y === p.y))) return false;
  s.bombs.push({ id: room.nextBombId++, ownerId: p.id, x: p.x, y: p.y, range: p.range, explodesAt: now + FUSE_MS });
  return true;
}

function eliminateInFlames(room: GameRoom, now: number): void {
  for (const p of room.state.players) {
    if (p.alive && room.state.flames.some(f => f.until > now && f.x === p.x && f.y === p.y)) p.alive = false;
  }
}

function explode(room: GameRoom, now: number, random: () => number): void {
  const s = room.state;
  const pending = s.bombs.filter(b => b.explodesAt <= now || s.flames.some(f => f.until > now && f.x === b.x && f.y === b.y));
  const exploded = new Set<number>(), destroyed = new Set<string>();
  // Keep the original crate layout throughout this tick: simultaneous blasts are order-independent.
  const ignite = (x: number, y: number) => {
    const existing = s.flames.find(f => f.x === x && f.y === y);
    if (existing) existing.until = now + FLAME_MS;
    else s.flames.push({ x, y, until: now + FLAME_MS });
    s.pickups = s.pickups.filter(p => p.x !== x || p.y !== y);
    for (const bomb of s.bombs) if (bomb.x === x && bomb.y === y && !exploded.has(bomb.id)) pending.push(bomb);
  };
  while (pending.length) {
    const bomb = pending.shift()!;
    if (exploded.has(bomb.id)) continue;
    exploded.add(bomb.id); ignite(bomb.x, bomb.y);
    for (const [dx, dy] of Object.values(vectors)) {
      for (let distance = 1; distance <= bomb.range; distance++) {
        const x = bomb.x + dx * distance, y = bomb.y + dy * distance;
        const tile = s.grid[y]?.[x];
        if (tile === undefined || tile === 1) break;
        ignite(x, y);
        if (tile === 2) { destroyed.add(`${x},${y}`); break; }
      }
    }
  }
  s.bombs = s.bombs.filter(b => !exploded.has(b.id));
  for (const key of destroyed) {
    const [x, y] = key.split(',').map(Number);
    s.grid[y][x] = 0;
    if (random() < 0.3) s.pickups.push({ x, y, type: random() < 0.5 ? 'speed' : 'range', availableAt: now + FLAME_MS });
  }
}

export function tick(room: GameRoom, now: number, random = Math.random): void {
  const s = room.state; s.serverTime = now;
  if (s.phase === 'countdown' && now >= s.startsAt) s.phase = 'playing';
  if (s.phase !== 'playing') return;
  s.flames = s.flames.filter(f => f.until > now);
  // Existing and newly due explosions apply before movement, so late inputs cannot dodge an expired fuse.
  explode(room, now, random);
  eliminateInFlames(room, now);
  for (const p of s.players) {
    const input = room.inputs.get(p.id);
    const direction = input?.direction ?? input?.pending;
    if (!p.alive || !p.connected || !input || !direction || now - input.lastSeen > 400 || now < input.nextMoveAt) continue;
    input.pending = null;
    p.facing = direction;
    const [dx, dy] = vectors[direction], x = p.x + dx, y = p.y + dy;
    if (s.grid[y]?.[x] !== 0 || s.bombs.some(b => b.x === x && b.y === y)) continue;
    p.x = x; p.y = y;
    input.nextMoveAt = now + STEP_MS / (1 + p.speed * 0.15);
  }
  eliminateInFlames(room, now);
  for (const p of s.players) {
    if (!p.alive) continue;
    s.pickups = s.pickups.filter(item => {
      if (item.availableAt > now || item.x !== p.x || item.y !== p.y) return true;
      if (item.type === 'speed' && p.speed < 3) { p.speed++; return false; }
      if (item.type === 'range' && p.range < 5) { p.range++; return false; }
      return true;
    });
  }
  const alive = s.players.filter(p => p.alive);
  if (alive.length <= 1 || now >= s.endsAt) {
    s.phase = 'results'; room.inputs.clear();
    s.winnerId = alive.length === 1 ? alive[0].id : null;
    s.resultReason = alive.length === 0 ? 'Everyone went out with a bang.' : alive.length === 1 ? 'Last buddy standing.' : 'Time is up. A well-fought draw.';
    if (alive.length === 1) alive[0].wins++;
    for (const p of s.players) p.ready = false;
  }
}
