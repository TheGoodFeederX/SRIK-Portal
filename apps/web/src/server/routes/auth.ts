import { Hono } from 'hono';
import type { AppEnv } from '../types.ts';

/**
 * Application session (spec §19). Authentication lives in Managed Auth; this endpoint only
 * reports the SRIK application state derived from the verified identity.
 * Never returns auth tokens or cookies.
 */
export const me = new Hono<AppEnv>();

/** Session teardown endpoint. Authentication itself is ended via Managed Auth signOut. */
me.post('/logout', (c) => c.json({ data: { ok: true }, requestId: c.var.requestId }));

me.get('/session', (c) => {
  const identity = c.var.identity;
  if (!identity) {
    return c.json({ data: { state: 'signed-out', user: null }, requestId: c.var.requestId });
  }
  if (c.var.user) {
    return c.json({
      data: { state: 'authenticated-active', user: c.var.user },
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
