import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  // Node silently truncates odd/non-hex strings, so validate before use.
  if (!/^[0-9a-f]+$/.test(saltHex) || !/^[0-9a-f]+$/.test(keyHex) || keyHex.length % 2 !== 0 || saltHex.length % 2 !== 0) {
    return false;
  }
  const expected = Buffer.from(keyHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Store only the hash of session tokens so a DB leak cannot be replayed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
