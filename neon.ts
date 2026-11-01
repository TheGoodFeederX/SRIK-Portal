import { defineConfig } from '@neon/config/v1';

// Managed Better Auth is provisioned per Neon branch (see docs/migrations/AUTH_MIGRATION_v1.1.md).
export default defineConfig({
  auth: true,
});
