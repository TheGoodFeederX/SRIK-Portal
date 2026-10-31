import { scryptSync, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createDb } from './index.ts';

const db = createDb();

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@srik.local';
const password = process.env.SEED_ADMIN_PASSWORD;
if (!password || password.length < 8) throw new Error('SEED_ADMIN_PASSWORD (>=8 chars) is required');

// Idempotent: re-running seed only refreshes the admin password/role.
await db.execute(sql`
  INSERT INTO profiles (email, password_hash, display_name, status)
  VALUES (${email}, ${hashPassword(password)}, 'Pentadbir SRIK', 'ACTIVE')
  ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, status = 'ACTIVE'
`);
await db.execute(sql`
  INSERT INTO user_roles (profile_id, role)
  SELECT id, 'ADMIN' FROM profiles WHERE email = ${email}
  ON CONFLICT DO NOTHING
`);
await db.execute(sql`
  UPDATE user_roles SET role = 'ADMIN'
  WHERE profile_id = (SELECT id FROM profiles WHERE email = ${email}) AND role <> 'ADMIN'
`);
console.log(`seeded admin ${email}`);
process.exit(0);
