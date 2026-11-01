import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Permission } from '@srik/shared';
import type { AppEnv } from '../types.ts';
import { verifyIdentity } from './identity.ts';
import { resolveApplicationUser } from './application-user.ts';

/**
 * Loads Managed Auth identity → application user. Never throws:
 * `c.var.denial` carries why an authenticated identity has no application access.
 * ponytail: no fallback to the legacy srik_session cookie (spec §21 forbids dual auth).
 */
export const loadApplicationUser = async (c: Context<AppEnv>, next: Next) => {
  c.set('identity', null);
  c.set('denial', null);
  c.set('user', null);

  if (!process.env.NEON_AUTH_BASE_URL) {
    await next();
    return;
  }

  const result = await verifyIdentity({
    cookie: c.req.header('cookie'),
    authorization: c.req.header('authorization'),
  });
  if (result.kind !== 'ok') {
    await next();
    return;
  }

  c.set('identity', result.identity);
  const lookup = await resolveApplicationUser(c.var.db, result.identity);
  if (lookup.kind === 'ok') c.set('user', lookup.user);
  else c.set('denial', lookup.denial);
  await next();
};

export function requireUser(c: Context<AppEnv>) {
  const user = c.var.user;
  if (user) return user;
  if (c.var.denial) {
    throw new HTTPException(403, { message: c.var.denial.message, cause: { code: c.var.denial.code } });
  }
  throw new HTTPException(401, { message: 'Sesi tidak sah. Sila log masuk.', cause: { code: 'AUTH_REQUIRED' } });
}

/**
 * Permission gate. Returns middleware so routes stay one line.
 * Record scope (which records) is a separate check inside each service.
 */
export function requirePermission(permission: Permission) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = requireUser(c);
    if (!user.permissions.includes(permission)) {
      throw new HTTPException(403, { message: 'Anda tidak mempunyai akses.', cause: { code: 'FORBIDDEN' } });
    }
    await next();
  };
}

export function isAdmin(c: Context<AppEnv>): boolean {
  return c.var.user?.roles.includes('ADMIN') ?? false;
}
