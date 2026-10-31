import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { profiles, sessions, userRoles } from '@srik/db';
import { permissionsForRoles, type Permission, type Role } from '@srik/shared';
import type { AppEnv } from '../types.ts';
import { hashToken } from './password.ts';

export const SESSION_COOKIE = 'srik_session';
const SESSION_DAYS = 14;

export async function createSession(db: AppEnv['Variables']['db'], profileId: string, token: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: hashToken(token), profileId, expiresAt });
  return expiresAt;
}

export async function destroySession(db: AppEnv['Variables']['db'], token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export function readToken(c: Context<AppEnv>): string | null {
  const cookie = c.req.header('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (match?.[1]) return decodeURIComponent(match[1]);
  const bearer = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  return bearer || null;
}

/** Loads the session + roles + permissions onto the context. Never throws. */
export const loadSession = async (c: Context<AppEnv>, next: Next) => {
  const token = readToken(c);
  if (token && process.env.DATABASE_URL) {
    const [row] = await c.var.db
      .select({ profileId: profiles.id, email: profiles.email, displayName: profiles.displayName, status: profiles.status, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(profiles, eq(profiles.id, sessions.profileId))
      .where(eq(sessions.id, hashToken(token)))
      .limit(1);
    if (row && row.expiresAt > new Date() && row.status === 'ACTIVE') {
      const roles = (await c.var.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.profileId, row.profileId))).map(
        (r) => r.role as Role,
      );
      c.set('user', {
        id: row.profileId,
        email: row.email,
        displayName: row.displayName,
        roles,
        permissions: permissionsForRoles(roles),
      });
    }
  }
  await next();
};

export function requireUser(c: Context<AppEnv>) {
  const user = c.var.user;
  if (!user) throw new HTTPException(401, { message: 'Sesi tidak sah. Sila log masuk.' });
  return user;
}

/**
 * Permission gate. Returns middleware so routes stay one line.
 * Scope (which records) is a separate check inside each service.
 */
export function requirePermission(permission: Permission) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = requireUser(c);
    if (!user.permissions.includes(permission)) {
      throw new HTTPException(403, { message: 'Anda tidak mempunyai akses.' });
    }
    await next();
  };
}

export function isAdmin(c: Context<AppEnv>): boolean {
  return c.var.user?.roles.includes('ADMIN') ?? false;
}
