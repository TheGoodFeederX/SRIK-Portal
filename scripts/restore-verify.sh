#!/usr/bin/env bash
# Restore drill verification (spec v1.1-PROD-R2 §19).
# Restores a dump into a NON-production Neon branch, then checks the tables the app depends on.
#   TARGET_URL=postgresql://...dev-branch bash scripts/restore-verify.sh backups/srik-*.dump
set -euo pipefail

DUMP="${1:?usage: restore-verify.sh <dump>}"
: "${TARGET_URL:?TARGET_URL is required (non-production branch)}"

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET_URL" "$DUMP"

psql "$TARGET_URL" -v ON_ERROR_STOP=1 <<'SQL'
\echo '--- required tables'
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('profiles','user_roles','staff','students','classes','enrollments',
                      'subjects','teaching_assignments','student_attendance','account_invitations','audit_log')
 ORDER BY table_name;
\echo '--- legacy artifacts (present before Stage B, absent after)'
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='sessions';
SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='password_hash';
\echo '--- identity bridge integrity'
SELECT count(*) AS profiles FROM profiles;
SELECT count(*) AS linked   FROM profiles WHERE auth_user_id IS NOT NULL;
SELECT count(*) AS admins   FROM user_roles WHERE role = 'ADMIN';
SELECT count(*) AS drift    FROM student_guardians sg
  LEFT JOIN students s ON s.id = sg.student_id WHERE s.id IS NULL;
SQL
echo "restore-verify: PASS"
