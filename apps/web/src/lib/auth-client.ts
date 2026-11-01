import { createAuthClient as createNeonAuthClient } from '@neon/neon-js/auth';
import { BetterAuthVanillaAdapter } from '@neon/neon-js/auth/vanilla';

/**
 * Single Managed Better Auth client (spec §17). Never instantiate per component.
 *
 * The browser talks to the auth service through this site's own origin (`/neonauth` →
 * vercel.json rewrite / vite proxy). That matters: the Managed Auth session cookie is set by the
 * auth service, so if the browser called the auth host directly the cookie would belong to that
 * host and would never be sent to `/api/v1`, leaving the API unable to see the session.
 */
const configured = (import.meta.env.VITE_NEON_AUTH_URL as string | undefined) ?? '/neonauth';
const baseUrl = configured.startsWith('http') ? configured : `${window.location.origin}${configured}`;

export const authConfigured = true;

export const authClient = createNeonAuthClient(baseUrl, { adapter: BetterAuthVanillaAdapter() });
