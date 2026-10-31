import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export * from './schema.ts';

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is required');
  // ponytail: one pooled client per process; Neon pooled endpoint does the rest.
  const client = postgres(url, { max: 5, prepare: false });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
