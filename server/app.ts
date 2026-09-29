import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { addPlayer, createRoom, placeBomb, startRound, tick, validDirection, type GameRoom } from './game.js';
import { RECONNECT_MS, type Reply } from '../shared/types.js';

interface Session { token: string; playerId: string; code: string; socketId: string | null; disconnectedAt: number | null }
interface Options { allowedOrigins?: string[]; production?: boolean; now?: () => number }
type Ack = (response: Reply) => void;

export function createGameServer(options: Options = {}) {
  const app = express(), http = createServer(app);
  const now = options.now ?? Date.now;
  const allowed = new Set(options.allowedOrigins ?? []);
  const originAllowed = (origin: string | undefined) => {
    if (!origin || allowed.has(origin)) return true;
    if (options.production) return false;
    try {
      const url = new URL(origin), host = url.hostname;
      return ['http:', 'https:'].includes(url.protocol) && (['localhost', '127.0.0.1', '[::1]'].includes(host) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host));
    } catch { return false; }
  };
  const io = new Server(http, {
    cors: { origin: (origin, cb) => cb(null, originAllowed(origin)) },
    allowRequest: (req, cb) => cb(null, originAllowed(req.headers.origin)),
    maxHttpBufferSize: 4096,
    pingInterval: 10_000,
    pingTimeout: 10_000,
  });
  const rooms = new Map<string, GameRoom>(), sessions = new Map<string, Session>();
  const publish = (room: GameRoom) => { room.state.serverTime = now(); io.to(room.state.code).emit('state', room.state); };
  const sessionFor = (socketId: string) => [...sessions.values()].find(s => s.socketId === socketId);
  const nameOf = (input: unknown) => typeof input === 'string' ? input.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16) : '';
  const transferHost = (room: GameRoom) => {
    if (!room.state.players.some(p => p.id === room.state.hostId && p.connected)) room.state.hostId = room.state.players.find(p => p.connected)?.id ?? room.state.players[0]?.id ?? '';
  };
  function removeSession(session: Session) {
    const room = rooms.get(session.code);
    if (room) {
      const player = room.state.players.find(p => p.id === session.playerId);
      if (player) {
        if (room.state.phase === 'playing') { player.alive = false; player.connected = false; }
        else room.state.players = room.state.players.filter(p => p.id !== session.playerId);
      }
      room.inputs.delete(session.playerId);
      transferHost(room);
      if (room.state.phase === 'countdown') { room.state.phase = 'lobby'; room.state.players.forEach(p => { p.ready = false; }); }
      if (!room.state.players.length || ![...sessions.values()].some(s => s !== session && s.code === session.code)) rooms.delete(session.code);
      else publish(room);
    }
    sessions.delete(session.token);
  }

  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ ok: true, game: 'Blast Buddies' }));
  const clientPath = resolve('dist/client');
  if (existsSync(clientPath)) app.use(express.static(clientPath));
  app.get('/', (_req, res) => res.json({ game: 'Blast Buddies', status: 'Game server is ready', health: '/health' }));

  // Bound connection and event costs without retaining an unbounded IP history.
  const connections = new Map<string, number>();
  io.use((socket, next) => {
    const address = socket.handshake.address;
    if ((connections.get(address) ?? 0) >= 40 || io.engine.clientsCount > 800) return next(new Error('Server is busy. Please try again shortly.'));
    connections.set(address, (connections.get(address) ?? 0) + 1);
    socket.on('disconnect', () => {
      const count = (connections.get(address) ?? 1) - 1;
      if (count <= 0) connections.delete(address); else connections.set(address, count);
    });
    next();
  });

  io.on('connection', socket => {
    let windowAt = now(), events = 0, lastRoomAt = -Infinity;
    socket.use(([_event, ...args], next) => {
      if (now() - windowAt >= 1_000) { windowAt = now(); events = 0; }
      if (++events > 50) {
        const ack = args.at(-1);
        if (typeof ack === 'function') ack({ ok: false, error: 'Slow down a moment and try again.' });
        return;
      }
      next();
    });
    socket.on('room:enter', (data: unknown, rawAck: unknown) => {
      if (typeof rawAck !== 'function') return;
      const ack = rawAck as Ack;
      if (!data || typeof data !== 'object') return ack({ ok: false, error: 'Enter a nickname to play.' });
      const payload = data as Record<string, unknown>;
      if (sessionFor(socket.id)) return ack({ ok: false, error: 'Leave your current room first.' });
      if (now() - lastRoomAt < 1_000) return ack({ ok: false, error: 'Wait a moment before joining again.' });
      lastRoomAt = now();
      const name = nameOf(payload.name);
      if (!name) return ack({ ok: false, error: 'Enter a nickname to play.' });
      let room: GameRoom | undefined;
      const id = randomUUID();
      if (payload.create === true) {
        if (rooms.size >= 100) return ack({ ok: false, error: 'All arenas are busy. Please try again soon.' });
        let code: string;
        do { code = Array.from(randomBytes(6), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 31]).join(''); } while (rooms.has(code));
        room = createRoom(code, id, now()); rooms.set(code, room);
      } else {
        const code = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
        room = rooms.get(code);
        if (!room) return ack({ ok: false, error: 'Room not found. Check the code or ask your friend for a new invite.' });
        if (room.state.phase === 'playing' || room.state.phase === 'countdown') return ack({ ok: false, error: 'This round is underway. Join when it finishes.' });
        if (room.state.players.length >= 4) return ack({ ok: false, error: 'This room is full. Four buddies is the limit.' });
      }
      addPlayer(room, id, name); room.lastActive = now();
      const token = randomBytes(24).toString('hex');
      sessions.set(token, { token, playerId: id, code: room.state.code, socketId: socket.id, disconnectedAt: null });
      socket.join(room.state.code);
      ack({ ok: true, code: room.state.code, playerId: id, token }); publish(room);
    });

    socket.on('room:resume', (token: unknown, rawAck: unknown) => {
      if (typeof rawAck !== 'function') return;
      const ack = rawAck as Ack;
      if (sessionFor(socket.id)) return ack({ ok: false, error: 'Already connected.' });
      const session = typeof token === 'string' ? sessions.get(token) : undefined;
      const room = session && rooms.get(session.code);
      if (!session || !room || (session.disconnectedAt !== null && now() - session.disconnectedAt >= RECONNECT_MS)) return ack({ ok: false, error: 'Your place expired or the server restarted. Join a room to play again.' });
      if (session.socketId) return ack({ ok: false, error: 'This player is already connected in another tab.' });
      const player = room.state.players.find(p => p.id === session.playerId);
      if (!player) return ack({ ok: false, error: 'Your place is no longer available.' });
      session.socketId = socket.id; session.disconnectedAt = null;
      player.connected = true; socket.join(session.code); transferHost(room);
      ack({ ok: true, code: session.code, playerId: session.playerId, token: session.token }); publish(room);
    });

    socket.on('room:leave', (rawAck: unknown) => {
      const session = sessionFor(socket.id);
      if (session) { socket.leave(session.code); removeSession(session); }
      if (typeof rawAck === 'function') rawAck({ ok: true });
    });
    socket.on('room:ready', (ready: unknown) => {
      const session = sessionFor(socket.id), room = session && rooms.get(session.code);
      if (!room || typeof ready !== 'boolean' || !['lobby', 'results'].includes(room.state.phase)) return;
      const player = room.state.players.find(p => p.id === session!.playerId);
      if (player) player.ready = ready;
      room.lastActive = now(); publish(room);
    });
    socket.on('room:start', (rawAck: unknown) => {
      if (typeof rawAck !== 'function') return;
      const ack = rawAck as Ack, session = sessionFor(socket.id), room = session && rooms.get(session.code);
      if (!room || room.state.hostId !== session!.playerId) return ack({ ok: false, error: 'Only the room host can start the round.' });
      if (!['lobby', 'results'].includes(room.state.phase)) return ack({ ok: false, error: 'A round is already underway.' });
      // Remove departed players retained on the results board.
      room.state.players = room.state.players.filter(p => p.connected || [...sessions.values()].some(s => s.playerId === p.id));
      if (room.state.players.length < 2 || room.state.players.some(p => !p.connected || !p.ready)) return ack({ ok: false, error: 'At least two players must be connected, and everyone must be ready.' });
      startRound(room, now()); room.lastActive = now(); ack({ ok: true }); publish(room);
    });
    socket.on('input', (direction: unknown) => {
      if (direction !== null && !validDirection(direction)) return;
      const session = sessionFor(socket.id), room = session && rooms.get(session.code);
      if (!room || room.state.phase !== 'playing') return;
      const previous = room.inputs.get(session!.playerId);
      room.inputs.set(session!.playerId, { direction, pending: direction ?? previous?.pending ?? null, lastSeen: now(), nextMoveAt: previous?.nextMoveAt ?? 0 });
    });
    socket.on('bomb', () => {
      const session = sessionFor(socket.id), room = session && rooms.get(session.code);
      if (room && placeBomb(room, session!.playerId, now())) publish(room);
    });
    socket.on('disconnect', () => {
      const session = sessionFor(socket.id), room = session && rooms.get(session.code);
      if (!session || !room) return;
      session.socketId = null; session.disconnectedAt = now();
      const player = room.state.players.find(p => p.id === session.playerId);
      if (player) { player.connected = false; player.ready = false; }
      room.inputs.delete(session.playerId);
      if (room.state.phase === 'countdown') room.state.phase = 'lobby';
      transferHost(room); publish(room);
    });
  });

  const interval = setInterval(() => {
    const time = now();
    for (const session of sessions.values()) if (session.disconnectedAt !== null && time - session.disconnectedAt >= RECONNECT_MS) removeSession(session);
    for (const room of rooms.values()) {
      const before = room.state.phase;
      tick(room, time);
      if (room.state.phase === 'results') room.state.players = room.state.players.filter(p => p.connected || [...sessions.values()].some(s => s.playerId === p.id));
      if (['playing', 'countdown'].includes(before) || before !== room.state.phase) publish(room);
      if (time - room.lastActive > 60 * 60_000 && ['lobby', 'results'].includes(room.state.phase)) {
        io.to(room.state.code).emit('room:closed', 'This idle room has closed. Create a fresh one to play.');
        for (const session of [...sessions.values()]) if (session.code === room.state.code) { if (session.socketId) io.sockets.sockets.get(session.socketId)?.leave(session.code); sessions.delete(session.token); }
        rooms.delete(room.state.code);
      }
    }
  }, 25);
  interval.unref();
  async function close() { clearInterval(interval); await new Promise<void>(resolve => io.close(() => resolve())); }
  return { app, http, io, rooms, sessions, close };
}
