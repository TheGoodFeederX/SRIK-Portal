import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { createDb, type Db } from '@srik/db';
import { loadSession, SESSION_COOKIE } from './auth/session.ts';
import { login, logout, me } from './routes/auth.ts';
import { auditLogRoutes } from './routes/audit.ts';
import { metaRoutes } from './routes/meta.ts';
import { staffRoutes } from './routes/staff.ts';
import { studentRoutes } from './routes/students.ts';
import { academicRoutes } from './routes/academic.ts';
import { attendanceRoutes } from './routes/attendance.ts';
import type { AppEnv } from './types.ts';

// Lazily created so contract tests (no DB) can import the app. Routes that touch data require DATABASE_URL.
export const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? randomUUID();
  c.set('requestId', requestId);
  c.set('user', null);
  const origin = c.req.header('origin');
  const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o: string) => o.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Headers', 'content-type, authorization, x-request-id');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  }
  c.header('X-Request-Id', requestId);
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
  c.header('Cache-Control', 'no-store');
});

app.use('*', (c, next) => {
  // DB is opened on first actual use, so contract tests need no database.
  let instance: Db | null = null;
  const lazy = new Proxy({} as Db, {
    get(_t, prop) {
      instance ??= createDb(process.env.DATABASE_URL);
      const value = instance[prop as keyof Db];
      return typeof value === 'function' ? value.bind(instance) : value;
    },
  });
  c.set('db', lazy);
  return next();
});

app.use('*', loadSession);

app.onError((err, c) => {
  const requestId = c.var.requestId ?? randomUUID();
  if (err instanceof HTTPException) {
    const codes: Record<number, string> = { 400: 'VALIDATION', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT' };
    const code = codes[err.status] ?? 'ERROR';
    const cause = err.cause as { fieldErrors?: unknown } | undefined;
    return c.json({ error: { code, message: err.message || code, details: cause?.fieldErrors ?? null }, requestId }, err.status);
  }
  // Postgres unique/foreign-key violations become a clean 409 instead of a 500.
  const pgCode = (err as { code?: string }).code;
  if (pgCode === '23505' || pgCode === '23503' || pgCode === '23514') {
    const message = pgCode === '23505' ? 'Rekod ini sudah wujud.' : 'Rekod berkaitan tidak sah.';
    return c.json({ error: { code: 'CONFLICT', message, details: null }, requestId }, 409);
  }
  // Never leak stack traces or SQL to the client.
  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      route: c.req.path,
      message: (err as Error).message,
      code: (err as { code?: string }).code ?? null,
    }),
  );
  return c.json({ error: { code: 'INTERNAL', message: 'Ralat pelayan.', details: null }, requestId }, 500);
});

/** Parses with Zod and maps failures to a 400 with field details. */
export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HTTPException(400, {
      message: 'Data tidak sah.',
      cause: result.error.flatten(),
    });
  }
  return result.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed ids are a client error (400), not a database error (500). */
export function idParam(c: { req: { param: (k: string) => string | undefined } }, name = 'id'): string {
  const value = c.req.param(name) ?? '';
  if (!UUID.test(value)) throw new HTTPException(400, { message: 'ID tidak sah.' });
  return value;
}

const v1 = new Hono<AppEnv>();
v1.get('/health', (c) => c.json({ data: { status: 'ok' }, requestId: c.var.requestId }));
v1.route('/auth', login);
v1.route('/auth', me);
v1.route('/auth', logout);
v1.route('/audit-log', auditLogRoutes);
v1.route('/meta', metaRoutes);
v1.route('/staff', staffRoutes);
v1.route('/students', studentRoutes);
v1.route('/', academicRoutes);
v1.route('/', attendanceRoutes);

app.route('/api/v1', v1);

/** Bundles the whole API into its own file so Vercel never re-types or re-resolves it. */
export type App = typeof app;
