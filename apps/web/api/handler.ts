import type { VercelRequest, VercelResponse } from '@vercel/node';
import { app } from '../api-dist/app.js';

// Node runtime (pins nodeVersion 22) and raw body access: the Hono app needs the untouched
// bytes for multipart .xlsx uploads, so Vercel must not pre-parse/consume the stream.
export const config = { runtime: 'nodejs', api: { bodyParser: false } };

/** Reads the request stream when Vercel left the body unparsed. */
async function rawBody(req: VercelRequest): Promise<Uint8Array | undefined> {
  const stream = req as unknown as AsyncIterable<Uint8Array>;
  if (typeof stream?.[Symbol.asyncIterator] !== 'function') return undefined;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as never));
  if (!chunks.length) return undefined;
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const protocol = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = req.headers.host ?? 'localhost';

  let body: Uint8Array | string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (typeof req.body === 'string') body = req.body;
    else if (Buffer.isBuffer(req.body)) body = new Uint8Array(req.body);
    else body = await rawBody(req);
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }

  const response = await app.fetch(
    new Request(`${protocol}://${host}${req.url ?? '/'}`, {
      method: req.method,
      headers,
      body: body as BodyInit | undefined,
    }),
  );
  res.statusCode = response.status;
  response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
