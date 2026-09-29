# Blast Buddies
# https://jamalford.github.io/Blast_Buddies/
Small bombs. Big grudges. A pixel-art browser game for 2–4 friends, built for the Handshake multiplayer challenge.

Create a room, share its link, and be the last buddy standing. Works with keyboard or touch controls. Original code-drawn pixel characters and tiles; no accounts or database.

## Play

- **Move:** WASD, arrow keys, or touch directional buttons.
- **Bomb:** Space or the touch bomb button. One active bomb per player.
- **Survive:** bombs explode after 2.5 seconds in a cross. Flames last 0.5 seconds and can eliminate their owner.
- **Cover:** walls stop blasts. Crates break and stop that blast. Bombs trigger chain reactions.
- **Collect:** destroyed crates have a 30% chance of revealing a power-up once flames clear. Boots add 15% starting speed (up to +45%). Blast boosts increase range from 2 to at most 5 tiles. Upgrades last for one round, and range is captured when a bomb is placed. Later blasts destroy exposed pickups. Pickups at your stat cap are left for other players.
- **Win:** one survivor wins; everyone eliminated together, or multiple survivors after 2 minutes, is a draw. Everyone marks ready for a rematch.

Players can pass through each other. Dropped bombs block movement but their owner can step off. Disconnected players remain vulnerable for a 10-second reconnection window, then forfeit. A new host is selected if the host disconnects. A disconnect during countdown cancels the start.

## Run locally

Use Node.js 24 LTS (22.12+ also supported).

```sh
npm ci
npm run dev
```

Open http://localhost:5173 in two independent browser tabs, enter different nicknames, create/join a room, mark everyone ready, then start. To test a phone on the same Wi-Fi, use the network address Vite prints. Each tab owns a separate session; refreshing can restore it within 10 seconds.

```sh
npm test       # Game rules and real Socket.IO room integration tests
npm run build # Type-check, build website, compile game server
npm start     # Serve the production build on port 3001 (or PORT)
```

Production hosting instructions: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Project layout

- `client/` — responsive interface, Canvas renderer, sound, input, and reconnection UI.
- `shared/` — state types and game constants.
- `server/game.ts` — authoritative rules, movement, blasts, drops, and results.
- `server/app.ts` — rooms, readiness, secure player sessions, connections, and server loop.
- `tests/` — deterministic engine and multiple-client integration tests.
- `.github/workflows/` — build checks and GitHub Pages publishing.
- `render.yaml` — optional one-service Render Blueprint.

The server ticks at 40 Hz and distributes authoritative snapshots. Clients send only directional intent and bomb actions, not trusted positions, power-up values, or results. Bomb resolution uses the crate layout at the beginning of the tick so simultaneous explosions do not depend on bomb iteration order. Touch and keyboard inputs expire if updates stop.

## Scope and limitations

Rooms live in one server process and disappear on restart or redeploy. Run **one instance**: horizontal scaling requires shared room routing/state. Room population, message size, event frequency, and idle rooms are bounded. There are no accounts, permanent rankings, or public matchmaking. Player wins persist only while their room session exists.

GitHub Pages hosts the browser client; Render runs the multiplayer server. Render also serves the client as a convenient fallback at its own URL. Free Render instances may take about a minute to wake. The UI retries connections and reports this state. Deployment changes should be made between games because server restarts end active rooms.

Fonts use Google Fonts with local fallbacks; gameplay and artwork do not depend on external art services.

## Manual release checklist

- [ ] Play a full round with two devices on different networks.
- [ ] Test three and four players; reject a fifth player and joins during a round.
- [ ] Test simultaneous movement and bombs on a phone.
- [ ] Test remote latency, a brief disconnect, refresh/rejoin, and reconnect expiry.
- [ ] Verify host handoff and multiple rematches.
- [ ] Verify the public Pages invite URL opens correctly from a fresh browser.

Automated local tests complement these checks; they do not replace a real internet playtest.
