import type { AuthIdentity } from '../types.ts';

/**
 * Managed Better Auth session verification.
 * The browser holds the neon_auth session cookie for the auth base URL; the API accepts the
 * token either from that cookie or from an `Authorization: Bearer` header.
 * Verification is a single call to the auth service's session endpoint.
 */
export type IdentityResult =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'ok'; identity: AuthIdentity };

// Managed Auth sets `__Secure-neon-auth.session_token`; keep the plain variants for http/dev.
export const NEON_AUTH_COOKIES = [
  '__Secure-neon-auth.session_token',
  'neon-auth.session_token',
  '__Secure-better-auth.session_token',
  'better-auth.session_token',
];

export function readAuthToken(headers: { cookie?: string; authorization?: string }): string | null {
  const bearer = headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  const cookie = headers.cookie ?? '';
  // Managed auth may prefix the cookie with __Secure- on https.
  for (const name of NEON_AUTH_COOKIES) {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

type AuthFetch = (input: string, init: RequestInit) => Promise<Response>;

/** Exported for contract tests: pure mapping of the auth service payload. */
export function mapSessionPayload(payload: unknown): AuthIdentity | null {
  const data = (payload as { user?: Record<string, unknown> } | null)?.user;
  if (!data || typeof data.id !== 'string' || typeof data.email !== 'string') return null;
  return {
    authUserId: data.id,
    email: data.email.toLowerCase(),
    emailVerified: data.emailVerified === true,
  };
}

export async function verifyIdentity(
  headers: { cookie?: string; authorization?: string },
  options: { baseUrl?: string; fetchImpl?: AuthFetch } = {},
): Promise<IdentityResult> {
  const baseUrl = options.baseUrl ?? process.env.NEON_AUTH_BASE_URL;
  const token = readAuthToken(headers);
  if (!baseUrl) return { kind: 'none' };
  if (!token) return { kind: 'none' };

  const doFetch: AuthFetch = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${baseUrl.replace(/\/$/, '')}/get-session`, {
      method: 'GET',
      // Better Auth reads the session token from its cookie, not from a bearer header.
      // The value keeps its cookie encoding exactly as received (API Gateway signs it).
      headers: { cookie: `__Secure-neon-auth.session_token=${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { kind: 'invalid' };
  }
  if (res.status === 401 || res.status === 403) return { kind: 'invalid' };
  if (!res.ok) return { kind: 'invalid' };
  const identity = mapSessionPayload(await res.json().catch(() => null));
  return identity ? { kind: 'ok', identity } : { kind: 'invalid' };
}
