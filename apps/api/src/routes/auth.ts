import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { loginAudit, profiles, userRoles } from '@srik/db';
import { SESSION_COOKIE, createSession, destroySession, readToken, requireUser } from '../auth/session.ts';
import { newToken, verifyPassword } from '../auth/password.ts';
import type { AppEnv } from '../types.ts';

// Secure only over HTTPS so local http:// still logs in.
const cookie = (name: string, value: string, expires: Date) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

const credentials = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

export const login = new Hono<AppEnv>();

login.post('/login', async (c) => {
  const result = credentials.safeParse(await c.req.json().catch(() => ({})));
  if (!result.success) throw new HTTPException(400, { message: 'Emel atau kata laluan tidak lengkap.' });
  const body = result.data;
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = c.req.header('user-agent') ?? null;
  const db = c.var.db;

  const [profile] = await db.select().from(profiles).where(eq(profiles.email, body.email.toLowerCase())).limit(1);
  const ok = Boolean(profile && verifyPassword(body.password, profile.passwordHash) && profile.status === 'ACTIVE');

  await db.insert(loginAudit).values({ email: body.email.toLowerCase(), success: ok, ipAddress: ip, userAgent: ua });
  if (!ok || !profile) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Emel atau kata laluan tidak sah.' }, requestId: c.var.requestId }, 401);

  const token = newToken();
  const expiresAt = await createSession(db, profile.id, token);
  const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.profileId, profile.id))).map((r) => r.role);
  c.header(
    'Set-Cookie',
    cookie(SESSION_COOKIE, token, expiresAt),
  );
  return c.json({
    data: { id: profile.id, email: profile.email, displayName: profile.displayName, roles },
    requestId: c.var.requestId,
  });
});

export const me = new Hono<AppEnv>();
me.get('/session', (c) => c.json({ data: c.var.user, requestId: c.var.requestId }));

export const logout = new Hono<AppEnv>();
logout.post('/logout', async (c) => {
  requireUser(c);
  const token = readToken(c);
  if (token) await destroySession(c.var.db, token);
  c.header('Set-Cookie', cookie(SESSION_COOKIE, '', new Date(0)));
  return c.json({ data: { ok: true }, requestId: c.var.requestId });
});
