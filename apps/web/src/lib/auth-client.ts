import { createAuthClient as createNeonAuthClient } from '@neon/neon-js/auth';
import { BetterAuthVanillaAdapter } from '@neon/neon-js/auth/vanilla';

/**
 * Single Managed Better Auth client (spec §17). Never instantiate per component.
 * The base URL is browser-safe (it is the auth service endpoint, not a secret key).
 */
const baseUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;

export const authConfigured = Boolean(baseUrl);

export const authClient = baseUrl
  ? createNeonAuthClient(baseUrl, { adapter: BetterAuthVanillaAdapter() })
  : null;
