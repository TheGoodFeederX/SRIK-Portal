#!/usr/bin/env bash
# Logical backup of the SRIK production database (spec v1.1-PROD-R2 §17–§18).
#
# Retention target: daily 7 / weekly 4 / monthly 6 (see docs/releases/BACKUP_POLICY.md).
# Requires a DIRECT (unpooled) connection:
#   DATABASE_URL_UNPOOLED=postgresql://... bash scripts/backup.sh [outdir]
set -euo pipefail

OUT_DIR="${1:-backups}"
: "${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required (direct/unpooled connection)}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/srik-$STAMP.dump"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "backup: pg_dump not found; install postgresql-client" >&2
  exit 1
fi

# Schema + data, custom format (compressed, restorable with pg_restore).
pg_dump --format=custom --no-owner --no-privileges --file="$FILE" "$DATABASE_URL_UNPOOLED"
SHA="$(sha256sum "$FILE" | cut -d' ' -f1)"
SIZE="$(du -h "$FILE" | cut -f1)"
printf '%s  %s\n' "$SHA" "$(basename "$FILE")" > "$FILE.sha256"

cat > "$FILE.json" <<JSON
{"created_at":"$STAMP","file":"$(basename "$FILE")","size":"$SIZE","sha256":"$SHA","source":"production","tool":"pg_dump"}
JSON

echo "backup: $FILE ($SIZE, sha256 ${SHA:0:12}…)"
