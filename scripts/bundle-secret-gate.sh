#!/usr/bin/env bash
# Fails when the built client bundle contains server secrets or server-only env names.
# Spec v1.1-PROD §32. Run after `pnpm --filter @srik/web build`.
set -euo pipefail
DIST="${1:-apps/web/dist}"

if [ ! -d "$DIST" ]; then
  echo "bundle-secret-gate: $DIST missing; build first" >&2
  exit 1
fi

if grep -rIlE "npg_|napi_|vcp_|ghp_|secret_server_key|NEON_AUTH_BASE_URL" "$DIST"; then
  echo "bundle-secret-gate: FAIL — server secret or server-only env leaked into the client bundle" >&2
  exit 1
fi

echo "bundle-secret-gate: PASS ($DIST clean)"
