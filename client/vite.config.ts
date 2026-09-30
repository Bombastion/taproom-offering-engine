import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The admin app is served under /admin/ (see the Caddyfile at the repo root), next to the
// server's own routes. In development, `npm run dev` proxies /api to the server running on
// localhost:3000 (override with TOE_API_TARGET), so the app and API share an origin just like
// they do behind Caddy.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.TOE_API_TARGET ?? 'http://localhost:3000',
    },
  },
});
