import { createGameServer } from './app.js';

const port = Number(process.env.PORT || 3001);
const origins = (process.env.CLIENT_ORIGIN || 'https://jamalford.github.io').split(',').map(s => s.trim()).filter(Boolean);
if (process.env.RENDER_EXTERNAL_URL) origins.push(process.env.RENDER_EXTERNAL_URL);
const game = createGameServer({ allowedOrigins: origins, production: process.env.NODE_ENV === 'production' });
game.http.listen(port, '0.0.0.0', () => console.log(`Blast Buddies server listening on port ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  game.io.emit('room:closed', 'The server is restarting. Please reconnect and create a new room.');
  await game.close(); process.exit(0);
});
