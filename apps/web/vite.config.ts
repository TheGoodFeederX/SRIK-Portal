import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Minimal API dev server inside the Vite process.
 * Hono + TS run through Vite's own module pipeline, so no extra adapter dependency.
 * DB is only opened on first request (lazily), so `/` and the shell stay usable without DATABASE_URL.
 */
function apiDevServer(): Plugin {
  return {
    name: 'srik-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/v1', async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        try {
          const { app } = await server.ssrLoadModule('/src/server/app.ts');
          const body = await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on('data', (c: Buffer) => chunks.push(c));
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', reject);
          });
          const url = new URL(req.url ?? '/', 'http://localhost');
          // `server.ssrLoadModule` runs the API outside Vite's env loader, so the server-only
          // auth values would be missing. They come from the same var the client uses.
          process.env.NEON_AUTH_BASE_URL ??= process.env.VITE_NEON_AUTH_URL ?? server.config.env.VITE_NEON_AUTH_URL;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
            else if (Array.isArray(v)) headers.set(k, v.join('; '));
          }
          const request = new Request(`http://localhost:5173/api/v1${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : new Uint8Array(body),
          });
          const response = await app.fetch(request);
          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    apiDevServer(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Portal SRIK',
        short_name: 'SRIK',
        description: 'Portal Pengurusan Sekolah Rendah Islam Al-Khairiah',
        lang: 'ms',
        start_url: '/app',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0f766e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Online-first: app shell + static assets only. API/auth responses are never cached.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{ urlPattern: /\/api\/.*/, handler: 'NetworkOnly' }],
      },
    }),
  ],
  resolve: {
    // Shared types/permissions resolve via the workspace link; no alias so tsc and vite agree.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same-origin auth in dev so the browser receives the Managed Auth session cookie for
    // localhost (it is otherwise scoped to the auth service host and never reaches our API).
    proxy: {
      '/neonauth': {
        target: process.env.NEON_AUTH_BASE_URL ?? process.env.VITE_NEON_AUTH_URL ?? 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/neonauth/, ''),
      },
    },
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
});
