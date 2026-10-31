import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

// ponytail: relative imports carry .js so any TS consumer (apps/web, tsc) resolves them
// without allowImportingTsExtensions. Node's --experimental-strip-types maps .js -> .ts.
export * from './schema.ts';

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is required');
  const client = postgres(url, { max: 5, prepare: false });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
