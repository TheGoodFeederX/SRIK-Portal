import { randomBytes, randomInt, scrypt } from 'node:crypto';
import postgres from 'postgres';

/**
 * Managed Better Auth credential operations for account provisioning and admin-driven reset
 * (spec v1.1-PROD-R2 §5, §7, §12).
 *
 * Why this exists: Managed Neon Auth exposes no admin API for creating a credential or setting a
 * password (the admin plugin is not provisionable and email delivery is unavailable for alias
 * addresses). Provisioning therefore writes the same columns the auth service reads.
 *
 * Scope of the dependency is deliberately tiny and mirrored from Better Auth's own node hasher:
 *   neon_auth.user      (email, name, emailVerified)
 *   neon_auth.account   (providerId='credential', password = `<saltHex>:<keyHex>`, scrypt N=16384 r=16 p=1 dkLen=64)
 *
 * ponytail: if Neon Auth later exposes a supported admin credential API, or changes its hasher,
 * this module is the only place to change. Verified against better-auth 1.7 (see docs).
 */

const SCRYPT = { N: 16384, r: 16, p: 1, dkLen: 64, maxmem: 128 * 16384 * 16 * 2 } as const;

export type CredentialDb = {
  query: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;
  end: () => Promise<void>;
};

/** One short-lived connection per call: credential writes must not share the pooled app client. */
async function withDb<T>(fn: (db: CredentialDb) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    return await fn({
      query: (text, params) => sql.unsafe(text, params as never[]) as unknown as Promise<Record<string, unknown>[]>,
      end: async () => {
        await sql.end({ timeout: 5 });
      },
    });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

export async function hashCredential(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, SCRYPT.dkLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem }, (err, k) =>
      err ? reject(err) : resolve(k),
    );
  });
  return `${salt}:${key.toString('hex')}`;
}

/**
 * Generates a temporary password. Avoids ambiguous glyphs (0/O, 1/l/I) because it is read aloud
 * or copied by hand. Always satisfies the app's >=12 char policy.
 */
export function generateTemporaryPassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const symbols = '!@#$%&*';
  const pick = (set: string) => set[randomInt(0, set.length)]!;
  const chars = Array.from({ length: length - 3 }, () => pick(alphabet));
  chars.push(pick('ABCDEFGHJKLMNPQRSTUVWXYZ'), pick('abcdefghijkmnpqrstuvwxyz'), pick('23456789'), pick(symbols));
  // Fisher-Yates so the guaranteed classes are not always at the end.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

export type ProvisionResult = { authUserId: string; temporaryPassword: string };

/** Creates a credential identity for an alias email. Returns a temporary password once. */
export async function provisionIdentity(email: string, name: string, password?: string): Promise<ProvisionResult> {
  const temporaryPassword = password ?? generateTemporaryPassword();
  const hash = await hashCredential(temporaryPassword);

  const authUserId = await withDb(async (db) => {
    const existing = await db.query('SELECT id FROM neon_auth."user" WHERE lower(email) = $1 LIMIT 1', [email.toLowerCase()]);
    if (existing[0]?.id) {
      await db.query('UPDATE neon_auth.account SET password = $1, "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = $3', [
        hash,
        existing[0].id,
        'credential',
      ]);
      return String(existing[0].id);
    }
    const inserted = await db.query(
      `INSERT INTO neon_auth."user" (email, name, "emailVerified") VALUES ($1, $2, true) RETURNING id`,
      [email.toLowerCase(), name],
    );
    const id = String(inserted[0]!.id);
    await db.query(
      // updatedAt has no column default in the managed schema.
      `INSERT INTO neon_auth.account ("userId", "accountId", "providerId", password, "updatedAt")
       VALUES ($1, $2, 'credential', $3, now())`,
      [id, id, hash],
    );
    return id;
  });

  return { authUserId, temporaryPassword };
}

/** Admin-driven password reset: sets a new temporary password for an existing auth identity. */
export async function setCredentialPassword(authUserId: string, password: string): Promise<void> {
  const hash = await hashCredential(password);
  await withDb(async (db) => {
    const rows = await db.query('UPDATE neon_auth.account SET password = $1, "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = $3', [
      hash,
      authUserId,
      'credential',
    ]);
    if (!rows) throw new Error('credential update failed');
  });
}

/** Alias email change (§14): keeps auth identity and SRIK profile in step. */
export async function updateIdentityEmail(authUserId: string, email: string): Promise<void> {
  await withDb(async (db) => {
    await db.query('UPDATE neon_auth."user" SET email = $1, "updatedAt" = now() WHERE id = $2', [email.toLowerCase(), authUserId]);
  });
}

/** Removes an auth identity and its sessions (used when provisioning is rolled back). */
export async function deleteIdentity(authUserId: string): Promise<void> {
  await withDb(async (db) => {
    await db.query('DELETE FROM neon_auth.session WHERE "userId" = $1', [authUserId]);
    await db.query('DELETE FROM neon_auth.account WHERE "userId" = $1', [authUserId]);
    await db.query('DELETE FROM neon_auth."user" WHERE id = $1', [authUserId]);
  });
}
