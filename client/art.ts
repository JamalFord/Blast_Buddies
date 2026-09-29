import { COLS, ROWS, PLAYER_COLORS, FUSE_MS, type Player, type RoomState } from '../shared/types.js';

export const TILE = 32;
const sprites = [
  '     hhhhhh     ',
  '   hhhhhhhhhh   ',
  '  hhhhhhhhhhhh  ',
  '  hhhhhhhhhhhh  ',
  '  hssssssssssh  ',
  '  hssessessssh  ',
  '  hssessessssh  ',
  '   ssssssssss   ',
  '    ssssssss    ',
  '  hhhhhhhhhhhh  ',
  ' hhhaaaaaahhhh  ',
  ' sshaaaaaahhss  ',
  ' sshaaaaaahhss  ',
  '    aaaaaaaa    ',
  '    aaaaaaaa    ',
  '   bbbb  bbbb   ',
  '   bbbb  bbbb   ',
];
export function drawBuddy(ctx: CanvasRenderingContext2D, x: number, y: number, slot: number, scale = 1, facing = 'down', step = 0) {
  const color = PLAYER_COLORS[slot];
  ctx.fillStyle = '#15282045'; ctx.fillRect(x - 8 * scale, y + 7 * scale, 17 * scale, 4 * scale);
  const colors: Record<string, string> = { h: color, s: '#ffe0b7', e: '#263025', a: '#334943', b: '#172a26' };
  sprites.forEach((line, row) => [...line].forEach((ch, col) => {
    if (ch === ' ') return;
    if (facing === 'up' && (ch === 's' || ch === 'e') && row < 9) ctx.fillStyle = color;
    else ctx.fillStyle = colors[ch];
    const bounce = row > 14 ? ((col < 8 ? 1 : -1) * step) : 0;
    ctx.fillRect(Math.round(x + (col - 8) * scale), Math.round(y + (row - 9 + bounce) * scale), Math.ceil(scale), Math.ceil(scale));
  }));
  ctx.fillStyle = '#ffffff50'; ctx.fillRect(x - 3 * scale, y - 8 * scale, 5 * scale, 2 * scale);
}

export function drawBomb(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, urgency = false) {
  ctx.fillStyle = '#12272350'; ctx.fillRect(x - 9, y + 7, 20, 4);
  ctx.fillStyle = '#1a2628'; ctx.fillRect(x - 7, y - 7, 15, 17); ctx.fillRect(x - 10, y - 4, 21, 11);
  ctx.fillStyle = '#344044'; ctx.fillRect(x - 5, y - 7, 10, 3); ctx.fillRect(x - 9, y - 3, 5, 8);
  ctx.fillStyle = urgency && Math.floor(time / 100) % 2 ? '#ff9e67' : '#e2e9cf'; ctx.fillRect(x - 5, y - 4, 4, 3);
  ctx.fillStyle = '#dec795'; ctx.fillRect(x + 1, y - 10, 3, 4); ctx.fillRect(x + 4, y - 13, 3, 4);
  ctx.fillStyle = Math.floor(time / 140) % 2 ? '#fbe9a4' : '#ff9a53';
  ctx.fillRect(x + 5, y - 16, 3, 5); ctx.fillRect(x + 3, y - 14, 7, 2);
}

function drawPickup(ctx: CanvasRenderingContext2D, x: number, y: number, type: string, now: number) {
  y += Math.sin(now / 260) * 1.5;
  ctx.fillStyle = '#23332c'; ctx.fillRect(x - 10, y - 10, 20, 20);
  ctx.fillStyle = type === 'speed' ? '#a996ff' : '#ffbe66'; ctx.fillRect(x - 8, y - 8, 16, 16);
  ctx.fillStyle = '#ffffff65'; ctx.fillRect(x - 6, y - 6, 3, 3);
  ctx.fillStyle = '#27342c';
  if (type === 'speed') { ctx.fillRect(x - 4, y - 5, 5, 8); ctx.fillRect(x - 4, y + 1, 9, 4); ctx.fillRect(x - 6, y + 5, 12, 2); }
  else { ctx.fillRect(x - 2, y - 6, 4, 12); ctx.fillRect(x - 6, y - 2, 12, 4); ctx.fillStyle = '#fff2b5'; ctx.fillRect(x - 1, y - 1, 2, 2); }
}

interface Position { x: number; y: number }
export class Arena {
  private ctx: CanvasRenderingContext2D;
  private positions = new Map<string, Position>();
  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = COLS * TILE; canvas.height = ROWS * TILE;
    this.ctx = canvas.getContext('2d')!; this.ctx.imageSmoothingEnabled = false;
  }
  reset() { this.positions.clear(); }
  draw(state: RoomState, myId: string, now: number, preview = false) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    state.grid.forEach((row, y) => row.forEach((tile, x) => {
      const xx = x * TILE, yy = y * TILE;
      ctx.fillStyle = (x + y) % 2 ? '#59795e' : '#55745a'; ctx.fillRect(xx, yy, TILE, TILE);
      ctx.fillStyle = '#73936a60';
      if ((x * 3 + y) % 4 === 0) { ctx.fillRect(xx + 6, yy + 22, 2, 3); ctx.fillRect(xx + 8, yy + 20, 2, 4); }
      if (tile === 1) {
        ctx.fillStyle = '#354d43'; ctx.fillRect(xx, yy, 32, 32);
        ctx.fillStyle = '#718277'; ctx.fillRect(xx + 1, yy + 1, 30, 25);
        ctx.fillStyle = '#89988a'; ctx.fillRect(xx + 2, yy + 2, 28, 4); ctx.fillRect(xx + 2, yy + 6, 3, 17);
        ctx.fillStyle = '#607369'; ctx.fillRect(xx + 5, yy + 23, 26, 4); ctx.fillRect(xx + 27, yy + 7, 3, 19);
        ctx.fillStyle = '#617269'; ctx.fillRect(xx + 11, yy + 10, 10, 2);
        if ((x + y) % 3 === 0) { ctx.fillStyle = '#a3b08b'; ctx.fillRect(xx + 5, yy + 3, 7, 3); }
      } else if (tile === 2) {
        ctx.fillStyle = '#34432d70'; ctx.fillRect(xx + 2, yy + 6, 29, 26);
        ctx.fillStyle = '#65452e'; ctx.fillRect(xx + 2, yy + 2, 28, 27);
        ctx.fillStyle = '#ba8a51'; ctx.fillRect(xx + 4, yy + 3, 24, 23);
        ctx.fillStyle = '#d7ab68'; ctx.fillRect(xx + 4, yy + 3, 24, 3); ctx.fillRect(xx + 4, yy + 3, 3, 22);
        ctx.fillStyle = '#906336'; ctx.fillRect(xx + 10, yy + 7, 2, 17); ctx.fillRect(xx + 20, yy + 7, 2, 17);
        ctx.fillStyle = '#e0b371';
        for (let i = 0; i < 20; i += 3) ctx.fillRect(xx + 6 + i, yy + 7 + i * 0.7, 4, 4);
        ctx.fillStyle = '#634b32'; ctx.fillRect(xx + 5, yy + 4, 2, 2); ctx.fillRect(xx + 25, yy + 23, 2, 2);
      }
    }));
    for (const item of state.pickups) if (item.availableAt <= now) drawPickup(ctx, item.x * TILE + 16, item.y * TILE + 16, item.type, now);
    for (const bomb of state.bombs) drawBomb(ctx, bomb.x * TILE + 16, bomb.y * TILE + 16, now, bomb.explodesAt - now < FUSE_MS / 3);
    for (const flame of state.flames) if (flame.until > now) {
      const x = flame.x * TILE, y = flame.y * TILE;
      ctx.fillStyle = '#f68d42'; ctx.fillRect(x + 3, y + 3, 26, 26);
      ctx.fillStyle = '#ffbd56'; ctx.fillRect(x + 7, y, 18, 32); ctx.fillRect(x, y + 7, 32, 18);
      ctx.fillStyle = Math.floor(now / 70) % 2 ? '#fff4b1' : '#ffe08b'; ctx.fillRect(x + 11, y + 3, 10, 26); ctx.fillRect(x + 3, y + 11, 26, 10);
    }
    for (const p of state.players) {
      if (!p.alive) continue;
      const target = { x: p.x * TILE + 16, y: p.y * TILE + 16 };
      const previous = this.positions.get(p.id) ?? target;
      if (Math.hypot(target.x - previous.x, target.y - previous.y) > TILE * 2) Object.assign(previous, target);
      const moving = Math.hypot(target.x - previous.x, target.y - previous.y) > 1;
      previous.x += (target.x - previous.x) * 0.28; previous.y += (target.y - previous.y) * 0.28;
      this.positions.set(p.id, previous);
      ctx.globalAlpha = p.connected ? 1 : 0.45;
      drawBuddy(ctx, Math.round(previous.x), Math.round(previous.y), p.slot, 1.2, p.facing, moving ? Math.sin(now / 55) : 0);
      ctx.globalAlpha = 1;
      if (p.id === myId && !preview) {
        ctx.fillStyle = '#f2f6d2'; ctx.fillRect(previous.x - 3, previous.y - 22, 6, 3); ctx.fillRect(previous.x - 1, previous.y - 19, 2, 2);
      }
    }
  }
}

export function avatar(player: Pick<Player, 'slot'>): string {
  return `<span class="avatar" style="--buddy:${PLAYER_COLORS[player.slot]}" aria-hidden="true"><span class="avatar-face"><i></i><i></i></span></span>`;
}
