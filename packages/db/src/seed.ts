import { sql } from 'drizzle-orm';
import { createDb } from './index.ts';

/**
 * Application seed (spec v1.1 §81).
 * Never creates auth credentials: an ADMIN identity is bootstrapped through Managed Auth
 * (docs/runbooks/BOOTSTRAP_ADMIN.md) and linked via profiles.auth_user_id.
 */
const db = createDb();

const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@srik.local').trim().toLowerCase();

await db.execute(sql`
  INSERT INTO profiles (email, display_name, status)
  VALUES (${email}, 'Pentadbir SRIK', 'ACTIVE')
  ON CONFLICT (email) DO UPDATE SET updated_at = now()
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

const rows = (await db.execute(
  sql`SELECT (auth_user_id IS NOT NULL) AS linked FROM profiles WHERE email = ${email}`,
)) as unknown as { linked: boolean }[];

console.log(`seeded application profile ${email} (ADMIN)`);
if (!rows[0]?.linked) {
  console.log('auth identity not linked yet - follow docs/runbooks/BOOTSTRAP_ADMIN.md');
}
process.exit(0);
