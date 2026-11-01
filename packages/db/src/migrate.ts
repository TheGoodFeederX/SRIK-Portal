import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client);
// Tables owned by Drizzle. Session tokens are hashed before storage (see apps/api).
// migrationsFolder is resolved relative to CWD so it works from the package dir and CI.
await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? 'migrations' });
// Enforce "one current academic year" at the database level.
await client.unsafe(
  `CREATE UNIQUE INDEX IF NOT EXISTS academic_years_single_current
   ON academic_years (is_current) WHERE is_current AND status = 'ACTIVE'`,
);
await client.end();
console.log('migrations applied');
