import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: { outDir: 'dist/client' },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      '/health': 'http://127.0.0.1:3001',
    },
  },
});
