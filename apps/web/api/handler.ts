import type { VercelRequest, VercelResponse } from '@vercel/node';
import { app } from '../api-dist/app.js';

// Vercel Node signature (pins nodeVersion 22). The Hono bundle turns Node's req/res into a
// Request/Response pair itself, so no adapter package is involved.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const protocol = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = req.headers.host ?? 'localhost';
  const body =
    req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? new Uint8Array(req.body)
          : JSON.stringify(req.body ?? {});

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }

  const response = await app.fetch(new Request(`${protocol}://${host}${req.url ?? '/'}`, { method: req.method, headers, body }));
  res.statusCode = response.status;
  response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
