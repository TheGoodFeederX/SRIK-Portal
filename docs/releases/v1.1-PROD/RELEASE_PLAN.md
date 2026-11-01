# RELEASE_PLAN — v1.1-PROD

**Spec:** `SRIK_PORTAL_IMPLEMENTATION_SPEC_v1.1-PROD.md`
**Sumber:** branch `feature/neon-auth-v1-1` (Stage A siap)
**Sasaran:** managed Better Auth dalam production; cleanup legacy dalam Stage B berasingan

> **Status kelulusan:** `APPROVE PROD CUTOVER v1.1` **DIBERI** oleh pemilik (2026-10-31), termasuk
> merge + deploy production. Stage A-PROD **selesai**; Stage B kekal **disekat** sehingga kelulusan
> berasingan.

---

## 1. Fasa dan pemetaan spec

| ID | Fasa | Pelaksana | Status |
|---|---|---|---|
| PROD-0 | Release preparation | Harness | ⚠️ siap sebahagian (lihat §2) |
| PROD-1 | Credential rotation | **Pemilik sahaja** | ❌ belum |
| PROD-2 | Backup & recovery point | Pemilik + Harness | ✅ branch `rollback-pre-v1.1-prod` |
| PROD-3 | Neon Auth production provisioning | Harness (boleh automasi) | ✅ `better_auth` pada `main` |
| PROD-4 | Migration A production | Harness (boleh automasi) | ✅ `0001_worried_ravenous` (direct conn) |
| PROD-5 | Admin bootstrap/link production | Pemilik (kredensial) | ⚠️ dipautkan; kata laluan sementara perlu diganti |
| PROD-6 | Vercel env production | Harness (boleh automasi) | ✅ |
| PROD-7 | Deploy (merge PR → main) | **Pemilik sahaja** (§79.15) | ✅ PR #1 merge `135d8967` |
| PROD-8 | Verification / smoke | Harness | ✅ 38/38 |
| PROD-9 | Stabilization | Pemilik + Harness | ⏳ bermula |
| PROD-10 | Stage B legacy removal | Harness selepas kelulusan berasingan | ❌ |
| PROD-11 | Post-removal verification | Harness | ❌ |

---

## 2. Production Readiness Gate (§9) — keadaan semasa

| # | Item | Status | Nota |
|---|---|---|---|
| 1 | Git branch reviewed | ✅ | 3 commit, 60 fail (+5 096/−323) |
| 2 | Branch comparison terhadap `main` | ✅ | `git diff main..feature/neon-auth-v1-1` disemak |
| 3 | CI green | ✅ | run `3d375892` pada PR #1 — lint, typecheck, api typecheck, unit, build, audit gate, bundle gate semuanya lulus |
| 4 | Production backup/recovery point | ✅ | Neon branch `rollback-pre-v1.1-prod` (`br-noisy-base-b3iqq2ey`) |
| 5 | Migration production reviewed | ✅ | `0001_worried_ravenous.sql` aditif sahaja |
| 6 | Production trusted domain diketahui | ✅ | `https://srik-portal.vercel.app` didaftarkan |
| 7 | Konfigurasi Neon Auth production diketahui | ✅ | `better_auth`, `neon_auth`, base URL `ep-dry-sunset-b3scjaeb…` |
| 8 | Strategi e-mel production | ⚠️ | keputusan pemilik: **A** (shared sementara) → `POST-PROD-EMAIL` |
| 9 | Prosedur admin bootstrap reviewed | ✅ | `docs/runbooks/BOOTSTRAP_ADMIN.md` |
| 10 | Rollback deployment dikenal pasti | ✅ | `dpl_74HYPNaA9SDpdyNJDf6Et9gffh3G` direkod |
| 11 | Env variables production disiapkan | ✅ | `NEON_AUTH_BASE_URL`, `VITE_NEON_AUTH_URL`, `CORS_ORIGINS` |
| 12 | Credential rotation selesai | ⚠️ | pemilik mengambil alih; semakan terakhir: ketiga-tiga token masih aktif |
| 13 | Tiada SQL Stage B dalam release ini | ✅ | hanya migration A |

**Kesimpulan gate: cutover dijalankan atas kelulusan pemilik, dengan satu item terbuka (#12 rotasi
kredensial — diambil alih oleh pemilik).**

**PR:** https://github.com/TheGoodFeederX/SRIK-Portal/pull/1 — **merged** (`135d8967`).

---

## 3. Perubahan yang dibawa oleh PR

```text
Authentication
  + Neon Managed Better Auth (@neon/neon-js)
  + profiles.auth_user_id (UNIQUE) sebagai jambatan identiti
  + keadaan aplikasi eksplisit: unlinked / invited / suspended / disabled / roleless
  - scrypt + cookie srik_session + POST /auth/login  (dibuang dari kod)

Application identity
  + account_invitations (TTL 72 jam, satu PENDING per emel)
  + API /users dan /onboarding
  + UI /app/administration/users

Authorization
  + academic.year.read, academic.class.read, academic.subject.read,
    academic.assignment.read, timetable.read
  + RESERVED_PERMISSIONS (tidak diberi)
  = record scope guru tidak berubah

Security
  + rate limit /users/* dan /onboarding/*
  + header keselamatan API
  + gate CI: audit critical/high, imbasan rahsia bundle

Rujukan
  + docs/security/AUTH_SECURITY.md
  + docs/runbooks/BOOTSTRAP_ADMIN.md
  + docs/migrations/AUTH_MIGRATION_v1.1.md
  + docs/releases/v1.1-PROD/*
```

**Skema legacy yang SENGAJA dikekalkan (rollback):** `public.sessions`, `profiles.password_hash`.

---

## 4. Kesan migration

| Item | Kesan |
|---|---|
| `profiles.auth_user_id` | lajur baharu, nullable, UNIQUE |
| `profiles.password_hash` | `NOT NULL` → `NULL` (data sedia ada kekal) |
| `profiles.status` lalai | `ACTIVE` → `INVITED` (baris sedia ada tidak berubah) |
| `account_invitations` | jadual baharu |
| `invitation_status` | enum baharu |
| `public.sessions` | **tidak disentuh** |
| Data domain | tiada perubahan, tiada tulis semula FK |

Migration A boleh diterbalikkan secara manual jika perlu (`DROP TABLE account_invitations`, `DROP COLUMN auth_user_id`), tetapi **tidak disyorkan** — ia tidak merosakkan Stage A.

---

## 5. Kesan environment

| Nama | Perubahan | Peringkat |
|---|---|---|
| `DATABASE_URL` | kekal (production branch `main`) | semua |
| `NEON_AUTH_BASE_URL` | **baharu** — server-only | Vercel (server) |
| `VITE_NEON_AUTH_URL` | **baharu** — selamat pelayar | Vercel (build) |
| `CORS_ORIGINS` | perlu `https://srik-portal.vercel.app` | Vercel |
| `AUTH_SECRET` | **boleh dibuang** (tidak digunakan lagi) | Vercel |
| `SEED_ADMIN_PASSWORD` | **boleh dibuang** (seed tidak guna kata laluan) | Vercel |

Larangan (§31): `NEON_AUTH_BASE_URL`, `DATABASE_URL`, token Neon/Vercel **tidak boleh** masuk bundle klien.
Gate: `scripts/bundle-secret-gate.sh` (dijalankan dalam CI dan sebelum deploy).

---

## 6. Pelan rollback

**Sebelum Stage B** (keadaan sekarang): legacy schema masih ada.

```text
1. hentikan rollout
2. promote deployment production sebelum v1.1 (ID direkod dalam RECOVERY_POINT.md)
3. pulihkan env production jika diubah
4. sahkan POST /api/v1/auth/login → 200 dan cookie srik_session berfungsi
5. sahkan API teras (students/staff/attendance)
6. siasat pada branch Neon `dev-auth-v1-1`
```

- **Jangan** buang skema `neon_auth` semasa rollback.
- **Jangan** terbalikkan Migration A (aditif).
- Selepas Stage B: rollback = restore DB atau forward-fix (§65).

---

## 7. Stage B — dikecualikan secara eksplisit

PR1 (cutover) **tidak mengandungi**:

```text
DELETE FROM public.sessions
DROP TABLE public.sessions
ALTER TABLE profiles DROP COLUMN password_hash
```

Stage B hanya bermula selepas `docs/releases/v1.1-PROD/STAGE_B_APPROVAL.md` ditandatangani (§75).

---

## 8. Langkah seterusnya yang menunggu pemilik

1. **Rotate** token GitHub, Neon, Vercel (PROD-1). Bukti: token lama → 401.
2. Beri kelulusan bertulis: `APPROVE PROD CUTOVER v1.1`.
3. Keputusan e-mel (§15): A (shared sementara) atau B (sender sekolah).
4. Selepas kelulusan: automasi PROD-3, PROD-4, PROD-6 dan jalankan PROD-8 menggunakan `SMOKE_TEST.md`.
