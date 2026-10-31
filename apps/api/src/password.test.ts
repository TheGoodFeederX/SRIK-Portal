import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword, hashToken } from './auth/password.ts';

test('password hash round-trips and rejects wrong password', () => {
  const stored = hashPassword('Rahsia12345!');
  assert.ok(stored.startsWith('scrypt$'));
  assert.equal(verifyPassword('Rahsia12345!', stored), true);
  assert.equal(verifyPassword('rahsia12345!', stored), false);
});

test('malformed stored hash is rejected, not thrown', () => {
  assert.equal(verifyPassword('x', 'garbage'), false);
  assert.equal(verifyPassword('x', 'scrypt$zz$zz'), false);
});

test('session tokens are hashed deterministically and not stored raw', () => {
  const token = 'abc123';
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), token);
});
