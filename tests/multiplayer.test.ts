import test from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/app.js';
import { type AddressInfo } from 'node:net';
import { type Reply, type RoomState } from '../shared/types.js';

function event<T>(socket: Socket, name: string, predicate: (value: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (value: T) => { if (predicate(value)) { clearTimeout(timeout); socket.off(name, handler); resolve(value); } };
    const timeout = setTimeout(() => { socket.off(name, handler); reject(new Error(`Timed out waiting for ${name}`)); }, 3_000);
    socket.on(name, handler);
  });
}
function emit(socket: Socket, name: string, value?: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const ack = (error: Error | null, reply: Reply) => error ? reject(error) : resolve(reply);
    if (value === undefined) socket.timeout(2_000).emit(name, ack); else socket.timeout(2_000).emit(name, value, ack);
  });
}
async function fixture() {
  let time = 10_000;
  const game = createGameServer({ now: () => time });
  await new Promise<void>(resolve => game.http.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${(game.http.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];
  async function connect() {
    const socket = io(address, { transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false });
    sockets.push(socket); const connected = event(socket, 'connect'); socket.connect(); await connected; return socket;
  }
  return { game, address, connect, advance: (ms: number) => { time += ms; }, close: async () => { sockets.forEach(s => s.disconnect()); await game.close(); } };
}

test('four independent clients share rooms, respect host/readiness, and receive the same result', async t => {
  const f = await fixture(); t.after(f.close);
  const [a, b, c, d, extra] = await Promise.all(Array.from({ length: 5 }, () => f.connect()));
  const created = await emit(a, 'room:enter', { create: true, name: 'Alpha' }); assert.ok(created.ok);
  const code = created.code!;
  for (const [socket, name] of [[b, 'Beta'], [c, 'Gamma'], [d, 'Delta']] as const) assert.ok((await emit(socket, 'room:enter', { code, name })).ok);
  const full = await emit(extra, 'room:enter', { code, name: 'Fifth' }); assert.equal(full.ok, false);
  assert.equal((await emit(a, 'room:start')).ok, false);
  assert.equal((await emit(b, 'room:start')).ok, false);
  const ready = event<RoomState>(a, 'state', s => s.players.every(p => p.ready));
  [a, b, c, d].forEach(s => s.emit('room:ready', true)); await ready;
  const starts = [a, b, c, d].map(s => event<RoomState>(s, 'state', s => s.phase === 'playing'));
  assert.ok((await emit(a, 'room:start')).ok); f.advance(3_000);
  const states = await Promise.all(starts); assert.ok(states.every(s => s.players.length === 4 && s.round === 1));
  f.advance(1_000);
  const underway = await emit(extra, 'room:enter', { code, name: 'Late' }); assert.equal(underway.ok, false);
  const planted = event<RoomState>(b, 'state', s => s.bombs.length === 1);
  a.emit('bomb'); await planted;
  const results = [a, b, c, d].map(s => event<RoomState>(s, 'state', s => s.phase === 'results'));
  f.advance(120_000);
  const endings = await Promise.all(results);
  assert.ok(endings.every(s => s.winnerId === null && !s.players.find(p => p.id === created.playerId)!.alive));
  assert.deepEqual(endings[0], endings[3]);
  const readyAgain = event<RoomState>(a, 'state', s => s.players.every(p => p.ready));
  [a, b, c, d].forEach(s => s.emit('room:ready', true)); await readyAgain;
  assert.ok((await emit(a, 'room:start')).ok);
  assert.equal(f.game.rooms.get(code)!.state.round, 2);
});

test('disconnect transfers host and a token restores the same player within the grace window', async t => {
  const f = await fixture(); t.after(f.close);
  const a = await f.connect(), b = await f.connect();
  const created = await emit(a, 'room:enter', { create: true, name: 'Alpha' }); assert.ok(created.ok);
  const joined = await emit(b, 'room:enter', { code: created.code, name: 'Beta' }); assert.ok(joined.ok);
  const handoff = event<RoomState>(b, 'state', s => s.hostId === joined.playerId);
  a.disconnect(); await handoff;
  const returning = await f.connect(); const resumed = await emit(returning, 'room:resume', created.token);
  assert.ok(resumed.ok); assert.equal(resumed.playerId, created.playerId);
  const duplicate = await f.connect(); assert.equal((await emit(duplicate, 'room:resume', created.token)).ok, false);
});

test('expired reconnect sessions forfeit and cannot reclaim the player', async t => {
  const f = await fixture(); t.after(f.close);
  const a = await f.connect(), b = await f.connect();
  const created = await emit(a, 'room:enter', { create: true, name: 'Alpha' }); assert.ok(created.ok);
  await emit(b, 'room:enter', { code: created.code, name: 'Beta' });
  const offline = event<RoomState>(b, 'state', s => s.players.some(p => !p.connected)); a.disconnect(); await offline;
  const removed = event<RoomState>(b, 'state', s => s.players.length === 1); f.advance(10_001); await removed;
  const returning = await f.connect(); assert.equal((await emit(returning, 'room:resume', created.token)).ok, false);
});

test('rooms remain isolated and invalid payloads cannot crash the server', async t => {
  const f = await fixture(); t.after(f.close);
  const a = await f.connect(), b = await f.connect();
  assert.equal((await emit(a, 'room:enter', null)).ok, false);
  const one = await emit(a, 'room:enter', { create: true, name: '<Alpha>' }); assert.ok(one.ok);
  const two = await emit(b, 'room:enter', { create: true, name: 'Beta' }); assert.ok(two.ok);
  assert.notEqual(one.code, two.code);
  a.emit('input', '__proto__'); a.emit('input', { x: 9, y: 9 }); a.emit('room:start'); a.emit('room:enter');
  assert.equal(f.game.rooms.get(one.code!)!.state.players[0].name, 'Alpha');
  assert.equal(f.game.rooms.get(two.code!)!.state.players.length, 1);
  assert.equal((await fetch(`${f.address}/health`)).status, 200);
  await emit(a, 'room:leave'); assert.equal(f.game.rooms.has(one.code!), false);
});

test('unapproved browser origins are rejected in production', async t => {
  const game = createGameServer({ production: true, allowedOrigins: ['https://jamalford.github.io'] });
  await new Promise<void>(resolve => game.http.listen(0, '127.0.0.1', resolve)); t.after(() => game.close());
  const address = `http://127.0.0.1:${(game.http.address() as AddressInfo).port}`;
  const bad = await fetch(`${address}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: 'https://other.example' } });
  assert.equal(bad.status, 403);
  const good = await fetch(`${address}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: 'https://jamalford.github.io' } });
  assert.equal(good.status, 200);
});
