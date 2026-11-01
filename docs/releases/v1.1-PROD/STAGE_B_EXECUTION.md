# STAGE_B_EXECUTION — v1.1-PROD-R2

**Tarikh:** 2026-11-01
**Kelulusan:** `docs/releases/v1.1-PROD/STAGE_B_APPROVAL.md` (12/12 gate ✅)
**Migration:** `packages/db/migrations/0003_remove_legacy_auth.sql`

---

## 1. Recovery point (dicipta dahulu)

| Item | Nilai |
|---|---|
| Neon branch | `rollback-pre-stage-b-20261101` / `br-autumn-base-b3nyb2s1` |
| Logical dump | `srik-20261101T030043Z.dump` (76 KB, sha256 `acced0fac652…`) |
| Git `main` sebelum DDL | `ea55ddab` |
| Deployment sebelum DDL | `dpl_3nvKXh1Ei8ymhcmRyG2cDDcFEqga` |
| Migration state sebelum | 3 applied |

## 2. SQL yang dijalankan

```sql
DELETE FROM "sessions";
DROP TABLE "sessions" CASCADE;
ALTER TABLE "profiles" DROP COLUMN "password_hash";
```

Dijana oleh `drizzle-kit generate` selepas `packages/db/src/schema.ts` berhenti menyatakan
kedua-duanya. Diuji pada branch `dev-academic-v1-2` dahulu, kemudian production melalui
sambungan **direct/unpooled**.

## 3. Pengesahan DB selepas

```text
sessions table            ABSENT
profiles columns          must_change_password, auth_user_id   (password_hash ABSENT)
migrations applied        4
neon_auth schema          hadir (dikelola Managed Auth)
```

## 4. Pengesahan aplikasi selepas (production)

```text
deploy                    dpl_GTyX4KEghZD5FMJLuGdJGnKPHbk6 (4ad7f4ec) READY
GET  /api/v1/health                                        200
GET  /api/v1/auth/session                                  200 authenticated-active ADMIN
GET  /users /subjects /teaching-assignments /enrollments
     /academic/summary /students /audit-log                200
POST /api/v1/users/provision                               201  (identiti + temp password)
POST {auth}/sign-in/email (guru, kata laluan sementara)     200
GET  /api/v1/students (sebelum tukar)                      403  PASSWORD_CHANGE_REQUIRED
POST /api/v1/auth/password-changed                         200
GET  /api/v1/students (guru)                               200  (scope terhad)
GET  /api/v1/users (guru)                                  403
DELETE /api/v1/users/{guru}                                200  (pembersihan ujian)
POST /api/v1/auth/login (legacy)                           404
GET  /api/v1/students (anon)                               401
```

## 5. Kod dan dokumentasi dibersihkan (§59, §60)

| Item | Keadaan |
|---|---|
| `sessions` dalam `schema.ts` | dibuang |
| `profiles.passwordHash` | dibuang |
| `auth/password.ts`, `verifyPassword`, `hashToken` | tiada (dibuang pada Stage A) |
| cookie `srik_session` | tiada dalam kod; hanya nota sejarah dalam `auth/session.ts` |
| `AUTH_SECRET` | dibuang daripada Vercel env dan `.env.example` |
| `SEED_ADMIN_PASSWORD` | tiada; seed tidak mencipta kredensial |
| Dokumentasi | README, AUTH_MIGRATION, RELEASE_PLAN dikemas kini kepada Managed Auth |

## 6. Rollback selepas Stage B

```text
Restore DB dari rollback-pre-stage-b-20261101 ATAU restore dump, kemudian promote
deployment sebelum Stage B. Redeploy aplikasi lama TIDAK memulihkan auth legacy.
```

## 7. Status

Stage B **SELESAI**. v1.1 sepenuhnya ditutup; production hanya menggunakan Managed Neon Auth.
