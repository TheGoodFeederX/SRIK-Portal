import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './types.ts';

type Bucket = { count: number; resetAt: number };

/**
 * Fixed-window in-memory limiter (spec §55). ponytail: per-instance state is enough to blunt
 * invitation abuse; move to the edge/provider limiter when traffic justifies it.
 */
const buckets = new Map<string, Bucket>();

export function resetRateLimits() {
  buckets.clear();
}

export function rateLimit({ key, limit, windowMs }: { key: string; limit: number; windowMs: number }) {
  return async (c: Context<AppEnv>, next: Next) => {
    const who =
      c.var.identity?.authUserId ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      'anonymous';
    const id = `${key}:${who}`;
    const now = Date.now();
    const bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
    } else if (bucket.count >= limit) {
      c.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      throw new HTTPException(429, { message: 'Terlalu banyak permintaan. Sila cuba sebentar lagi.', cause: { code: 'RATE_LIMITED' } });
    } else {
      bucket.count += 1;
    }
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    await next();
  };
}
