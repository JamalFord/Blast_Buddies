import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createMap, createRoom, placeBomb, startRound, tick, validDirection } from '../server/game.js';
import { SPAWNS, type Tile } from '../shared/types.js';

function arena() {
  const room = createRoom('ABC123', 'a', 0);
  addPlayer(room, 'a', 'Alpha'); addPlayer(room, 'b', 'Beta');
  startRound(room, 0); tick(room, 3_000);
  room.state.grid = createMap().map(row => row.map(t => t === 2 ? 0 : t));
  return room;
}
function input(room: ReturnType<typeof arena>, id: string, direction: 'up' | 'down' | 'left' | 'right', time: number) {
  const previous = room.inputs.get(id);
  room.inputs.set(id, { direction, lastSeen: time, nextMoveAt: previous?.nextMoveAt ?? 0 });
}

test('all spawns have two exits, walls enclose the map, and map is symmetric', () => {
  const map = createMap();
  for (const spawn of SPAWNS) {
    assert.equal(map[spawn.y][spawn.x], 0);
    const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => map[spawn.y + dy][spawn.x + dx] === 0);
    assert.equal(exits.length, 2);
  }
  assert.ok(map[0].every(t => t === 1)); assert.ok(map.at(-1)!.every(t => t === 1));
  assert.deepEqual(map, map.map(row => [...row].reverse()));
  assert.deepEqual(map, [...map].reverse());
});

test('countdown prevents movement and bombing', () => {
  const room = createRoom('ABC123', 'a', 0); addPlayer(room, 'a', 'A'); addPlayer(room, 'b', 'B'); startRound(room, 0);
  assert.equal(placeBomb(room, 'a', 100), false);
  input(room, 'a', 'right', 100); tick(room, 100);
  assert.equal(room.state.players[0].x, 1); assert.equal(room.state.phase, 'countdown');
  tick(room, 3_000); assert.equal(room.state.phase, 'playing');
});

test('every spawn has a short escape route out of its initial bomb radius', () => {
  const grid = createMap();
  for (const spawn of SPAWNS) {
    const queue = [{ ...spawn, steps: 0 }], visited = new Set<string>();
    let escaped = false;
    while (queue.length) {
      const p = queue.shift()!, key = `${p.x},${p.y}`;
      if (visited.has(key) || p.steps > 4) continue;
      visited.add(key);
      const inBlast = (p.x === spawn.x || p.y === spawn.y) && Math.abs(p.x - spawn.x) + Math.abs(p.y - spawn.y) <= 2;
      if (!inBlast) { escaped = true; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (grid[p.y + dy]?.[p.x + dx] === 0) queue.push({ x: p.x + dx, y: p.y + dy, steps: p.steps + 1 });
    }
    assert.ok(escaped, `No escape from ${spawn.x},${spawn.y}`);
  }
});

test('movement respects walls, speed cadence, and stale input expiry', () => {
  const room = arena(), p = room.state.players[0];
  input(room, 'a', 'left', 3_000); tick(room, 3_000); assert.equal(p.x, 1);
  input(room, 'a', 'right', 3_000); tick(room, 3_000); assert.equal(p.x, 2);
  tick(room, 3_100); assert.equal(p.x, 2);
  input(room, 'a', 'right', 3_200); tick(room, 3_200); assert.equal(p.x, 3);
  tick(room, 3_700); assert.equal(p.x, 3);
});

test('bomb capacity, fuse, walking off, and blocked reentry', () => {
  const room = arena(), p = room.state.players[0];
  assert.equal(placeBomb(room, 'a', 3_000), true);
  assert.equal(placeBomb(room, 'a', 3_000), false);
  input(room, 'a', 'right', 3_000); tick(room, 3_000); assert.equal(p.x, 2);
  input(room, 'a', 'left', 3_200); tick(room, 3_200); assert.equal(p.x, 2);
  p.x = 5;
  tick(room, 5_499); assert.equal(room.state.bombs.length, 1);
  tick(room, 5_500); assert.equal(room.state.bombs.length, 0);
  assert.equal(placeBomb(room, 'a', 5_500), true);
});

test('walls and crates block blasts; crate pickups wait for flame clearance', () => {
  const room = arena(), p = room.state.players[0]; p.x = 3; p.y = 3; p.range = 5;
  room.state.grid[3][5] = 2; room.state.grid[5][3] = 1;
  placeBomb(room, 'a', 3_000); p.x = 9; p.y = 1;
  tick(room, 5_500, () => 0);
  const has = (x: number, y: number) => room.state.flames.some(f => f.x === x && f.y === y);
  assert.ok(has(5, 3)); assert.equal(has(6, 3), false); assert.equal(has(3, 5), false);
  assert.equal(room.state.grid[3][5], 0);
  assert.deepEqual(room.state.pickups, [{ x: 5, y: 3, type: 'speed', availableAt: 6_000 }]);
  tick(room, 6_000); assert.equal(room.state.flames.length, 0);
});

test('chain reactions detonate later bombs in the same tick', () => {
  const room = arena(), [a, b] = room.state.players; a.x = 1; a.y = 3; b.x = 3; b.y = 3;
  placeBomb(room, a.id, 3_000); placeBomb(room, b.id, 4_000);
  a.x = 1; a.y = 1; b.x = 11; b.y = 9;
  tick(room, 5_500);
  assert.equal(room.state.bombs.length, 0);
  assert.ok(room.state.flames.some(f => f.x === 5 && f.y === 3));
});

test('simultaneous eliminations result in a draw rather than an early winner', () => {
  const room = arena(); placeBomb(room, 'a', 3_000); placeBomb(room, 'b', 3_000);
  tick(room, 5_500);
  assert.equal(room.state.phase, 'results'); assert.equal(room.state.winnerId, null);
  assert.equal(room.state.players.every(p => !p.alive && p.wins === 0), true);
});

test('bombs in the same tick use the same crate layout regardless of iteration order', () => {
  const make = (reverse: boolean) => {
    const room = arena(); room.state.grid[3][3] = 2;
    room.state.bombs = [
      { id: 1, ownerId: 'a', x: 1, y: 3, range: 5, explodesAt: 5_000 },
      { id: 2, ownerId: 'b', x: 5, y: 3, range: 5, explodesAt: 5_000 },
    ];
    if (reverse) room.state.bombs.reverse();
    room.state.players[0].x = 1; room.state.players[0].y = 9;
    tick(room, 5_000, () => 1);
    return room.state.flames.map(f => `${f.x},${f.y}`).sort();
  };
  assert.deepEqual(make(false), make(true));
});

test('one winner receives exactly one win; rematches reset upgrades but keep score', () => {
  const room = arena(), [a, b] = room.state.players; a.speed = 3; b.range = 5;
  placeBomb(room, 'a', 3_000); tick(room, 5_500); tick(room, 6_000);
  assert.equal(room.state.winnerId, 'b'); assert.equal(b.wins, 1);
  startRound(room, 7_000);
  assert.equal(room.state.phase, 'countdown'); assert.equal(room.state.round, 2);
  assert.equal(a.speed, 0); assert.equal(b.range, 2); assert.equal(b.wins, 1);
  assert.ok(room.state.players.every(p => p.alive && !p.ready));
});

test('time limit ends a round with a draw when multiple players survive', () => {
  const room = arena(); tick(room, room.state.endsAt);
  assert.equal(room.state.phase, 'results'); assert.equal(room.state.winnerId, null);
});

test('pickups stack to caps and retain an item when the stat is already capped', () => {
  const room = arena(), p = room.state.players[0];
  for (let i = 0; i < 4; i++) {
    room.state.pickups = [{ x: 1, y: 1, type: 'speed', availableAt: 0 }]; tick(room, 3_100 + i);
  }
  assert.equal(p.speed, 3); assert.equal(room.state.pickups.length, 1);
  for (let i = 0; i < 4; i++) {
    room.state.pickups = [{ x: 1, y: 1, type: 'range', availableAt: 0 }]; tick(room, 3_200 + i);
  }
  assert.equal(p.range, 5); assert.equal(room.state.pickups.length, 1);
});

test('speed upgrades shorten the movement interval', () => {
  const room = arena(), p = room.state.players[0]; p.speed = 3;
  input(room, 'a', 'right', 3_000); tick(room, 3_000);
  input(room, 'a', 'right', 3_150); tick(room, 3_150);
  assert.equal(p.x, 3);
});

test('a placed bomb keeps its original range after later upgrades', () => {
  const room = arena(), p = room.state.players[0]; placeBomb(room, 'a', 3_000); p.range = 5;
  assert.equal(room.state.bombs[0].range, 2);
});

test('eliminated and disconnected players cannot move or place bombs', () => {
  const room = arena(), p = room.state.players[0]; p.connected = false;
  input(room, 'a', 'right', 3_000); tick(room, 3_000);
  assert.equal(p.x, 1); assert.equal(placeBomb(room, 'a', 3_000), false);
  p.connected = true; p.alive = false; assert.equal(placeBomb(room, 'a', 3_000), false);
});

test('walking into active flames eliminates a player', () => {
  const room = arena(); room.state.flames = [{ x: 2, y: 1, until: 4_000 }];
  input(room, 'a', 'right', 3_100); tick(room, 3_100);
  assert.equal(room.state.players[0].alive, false); assert.equal(room.state.winnerId, 'b');
});

test('unknown directions and prototype keys are rejected', () => {
  for (const bad of ['__proto__', 'constructor', 'diagonal', {}, 1, null]) assert.equal(validDirection(bad), false);
  assert.equal(validDirection('left'), true);
});

test('exposed pickups are destroyed by later blasts', () => {
  const room = arena(); room.state.pickups = [{ x: 2, y: 1, type: 'speed', availableAt: 0 }];
  placeBomb(room, 'a', 3_000); room.state.players[0].x = 5;
  tick(room, 5_500); assert.equal(room.state.pickups.length, 0);
});

test('a short tap that ends between ticks moves once, without repeating', () => {
  const room = arena();
  room.inputs.set('a', { direction: null, pending: 'right', lastSeen: 3_000, nextMoveAt: 0 });
  tick(room, 3_025); assert.equal(room.state.players[0].x, 2);
  tick(room, 3_250); assert.equal(room.state.players[0].x, 2);
});
