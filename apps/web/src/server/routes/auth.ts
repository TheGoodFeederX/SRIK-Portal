import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { profiles } from '@srik/db';
import { requireUser } from '../auth/session.ts';
import { writeAudit } from './audit.ts';
import type { AppEnv } from '../types.ts';

/**
 * Application session (spec §19). Authentication lives in Managed Auth; this endpoint only
 * reports the SRIK application state derived from the verified identity.
 * Never returns auth tokens or cookies.
 */
export const me = new Hono<AppEnv>();

/** Session teardown endpoint. Authentication itself is ended via Managed Auth signOut. */
me.post('/logout', (c) => c.json({ data: { ok: true }, requestId: c.var.requestId }));

/**
 * Called after the browser has changed its password through Managed Auth (spec R2 §11).
 * The credential is owned by the auth service; this endpoint only clears the application flag
 * and records the audit event.
 */
me.post('/password-changed', async (c) => {
  const user = requireUser(c);
  if (!user.mustChangePassword) {
    return c.json({ data: { ok: true }, requestId: c.var.requestId });
  }
  await c.var.db.update(profiles).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(profiles.id, user.profileId));
  await writeAudit(c.var.db, {
    actorId: user.profileId,
    action: 'USER_PASSWORD_CHANGED',
    resourceType: 'profile',
    resourceId: user.profileId,
    requestId: c.var.requestId,
  });
  return c.json({ data: { ok: true }, requestId: c.var.requestId });
});


me.get('/session', (c) => {
  const identity = c.var.identity;
  if (!identity) {
    return c.json({ data: { state: 'signed-out', user: null }, requestId: c.var.requestId });
  }
  if (c.var.user) {
    // Forced first-login change (spec R2 §10): the shell stays closed until this clears.
    const state = c.var.user.mustChangePassword ? 'authenticated-password-change-required' : 'authenticated-active';
    return c.json({
      data: { state, user: c.var.user },
      requestId: c.var.requestId,
    });
  }
  const denial = c.var.denial!;
  return c.json({
    data: {
      state: denial.state,
      code: denial.code,
      message: denial.message,
      user: null,
      email: identity.email,
    },
    requestId: c.var.requestId,
  });
});
