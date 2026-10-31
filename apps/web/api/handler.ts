import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handle } from 'hono/vercel';
import { app } from '../api-dist/app.js';

// Node runtime (explicit handler types pin nodeVersion): scrypt + postgres need Node APIs.
// app is pre-bundled at build time (vite.api.config.ts); this file has no other imports.
const vercelHandler = handle(app);

export default function handler(req: VercelRequest, res: VercelResponse) {
  return vercelHandler(req, res);
}
