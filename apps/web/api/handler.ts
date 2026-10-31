import type { VercelRequest, VercelResponse } from '@vercel/node';

// Node runtime (explicit handler types pin nodeVersion): scrypt + postgres need Node APIs.
// The Hono app is pre-bundled at build time; the dynamic import keeps any module-load cost
// inside the request handler instead of the (fragile) function bootstrap.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const [{ handle }, { app }] = await Promise.all([import('hono/vercel'), import('../api-dist/app.js')]);
  return handle(app)(req, res);
}
