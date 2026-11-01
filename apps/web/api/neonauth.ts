import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Transport proxy: `/neonauth/*` → Managed Better Auth (spec v1.1 §20, §47).
 *
 * Purpose is cookie ownership only. The auth service sets its session cookie on the host it
 * answers from; calling it directly from the browser would scope the cookie to that host, so
 * `/api/v1` would never receive it. Proxying through this origin keeps the cookie first-party.
 *
 * Credentials are still issued and verified by the auth service — this file adds no
 * authentication logic, stores nothing, and logs nothing.
 */
export const config = { runtime: 'nodejs', api: { bodyParser: false } };

const upstream = () => {
  const url = process.env.NEON_AUTH_BASE_URL;
  if (!url) throw new Error('NEON_AUTH_BASE_URL is required');
  return url.replace(/\/$/, '');
};

async function readBody(req: VercelRequest): Promise<Uint8Array | undefined> {
  const stream = req as unknown as AsyncIterable<Uint8Array>;
  if (typeof stream?.[Symbol.asyncIterator] !== 'function') return undefined;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as never));
  if (!chunks.length) return undefined;
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.url ?? '/';
  const [rawPath, rawQuery = ''] = raw.split('?');
  const params = new URLSearchParams(rawQuery);
  const path = params.get('p') ?? '';
  params.delete('p');

  const target = `${upstream()}/${path.replace(/^\//, '')}${params.size ? `?${params}` : ''}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    // Host/connection belong to this hop; the upstream must see its own host.
    if (['host', 'connection', 'content-length'].includes(key.toLowerCase())) continue;
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }

  const response = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : ((await readBody(req)) as BodyInit | undefined),
    redirect: 'manual',
  });

  res.statusCode = response.status;
  response.headers.forEach((value: string, key: string) => {
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  // Multiple cookies must each be forwarded verbatim so the browser stores the session token.
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}
