# AUTH_MIGRATION_v1.1 — Migrasi Custom Auth → Managed Neon Auth

**Sumber keputusan:** `SRIK PORTAL — Implementation Spec v1.1`
**Strategi:** dua peringkat (Stage A rollback-safe, Stage B destruktif dengan kelulusan pemilik)

---

## 1. Keadaan asal (baseline)

```text
POST /api/v1/auth/login → profiles.password_hash (scrypt) → token rawak
→ SHA-256(token) dalam public.sessions → cookie HttpOnly srik_session
```

## 2. Keadaan sasaran

```text
Browser → Neon Managed Better Auth (neon_auth.*)
        → GET {NEON_AUTH_BASE_URL}/get-session
        → profiles.auth_user_id
        → user_roles → permissions → record scope
```

---

## 3. Stage A — perubahan yang sudah dilaksanakan

| Langkah | Status | Nota |
|---|---|---|
| Git branch `feature/neon-auth-v1-1` | ✅ | belum digabung ke `main` |
| Neon branch `dev-auth-v1-1` (`br-sparkling-king-b3o5hkms`) | ✅ | salinan `main` |
| Managed Auth diaktifkan | ✅ | `POST /projects/{p}/branches/{b}/auth` `{"auth_provider":"better_auth"}` |
| Nama aplikasi | ✅ | `Portal SRIK` |
| Trusted domain | ✅ | `http://localhost:5173`, preview `…git-feature-neon-auth-v1-1…` |
| `disable_sign_up` | ✅ | `PATCH …/auth/email_and_password` → `true` (pendaftaran awam ditutup) |
| `neon.ts` (`auth: true`) | ✅ | sumber kawalan versi |
| Migration A `0001_*` | ✅ | `auth_user_id`, `account_invitations`, `password_hash` nullable, lalai `INVITED` |
| Frontend auth client (`@neon/neon-js`) | ✅ | `apps/web/src/lib/auth-client.ts` |
| Identity bridge server | ✅ | `auth/identity.ts`, `auth/application-user.ts`, `auth/session.ts` |
| Modul pengguna + jemputan | ✅ | `/api/v1/users`, `/api/v1/onboarding` |
| UI pengguna | ✅ | `/app/administration/users` |
| Academic permission split | ✅ | `academic.*.read`, `timetable.read` |
| Shell 404 | ✅ | route `/app/*` tidak dikenali |
| Legacy code | ⚠️ dibuang daripada kod | `password.ts`, endpoint login, cookie `srik_session` |
| Legacy schema | ✅ dibuang | Stage B `0003_remove_legacy_auth` (2026-11-01) |
| Cutover production | ✅ 2026-10-31 | PR #1 merge `135d8967`, deploy `dpl_22mZR7NWf73QTb3hr6FRobyQVD9m` |

### Pautan admin production

```text
neon_auth.user id 105d17d9-0a5d-4166-a488-b1ad8ec15300
profiles.id       7441dfb3-12ab-4760-a5de-fbe2b21aa84d  (email admin@srik.local)
Neon branch       main / br-mute-sun-b3t283ay
Recovery branch   rollback-pre-v1.1-prod / br-noisy-base-b3iqq2ey
```

### Pautan admin dev

```text
neon_auth.user id 83fc1e2e-43ba-4f94-a9fe-2ff515861f56
profiles.id       7441dfb3-12ab-4760-a5de-fbe2b21aa84d  (email admin@srik.local)
```

---

## 4. Perintah yang digunakan

```bash
# Neon branch
POST /api/v2/projects/$P/branches            {"branch":{"name":"dev-auth-v1-1","parent_id":"..."}}
# Managed Auth
POST /api/v2/projects/$P/branches/$BR/auth   {"auth_provider":"better_auth"}
PATCH …/auth/config                          {"name":"Portal SRIK"}
POST …/auth/domains                          {"domain":"...","auth_provider":"better_auth"}
PATCH …/auth/email_and_password              {"disable_sign_up":true}

# Skema
pnpm --filter @srik/db migrate               # DATABASE_URL = branch dev
pnpm --filter @srik/db seed                  # tidak lagi menyimpan kata laluan production

# Ujian
pnpm typecheck && pnpm --filter @srik/web api:typecheck && pnpm test
SRIK_INTEGRATION=1 DATABASE_URL=$DEV_DATABASE_URL \
  node --test --experimental-strip-types apps/web/src/server/{application-user,invitations}.test.ts
```

---

## 5. Rollback Stage A

Legacy schema dikekalkan, jadi rollback = pulihkan deployment lama.

```text
1. Vercel → Promote deployment sebelum migrasi (mengandungi endpoint /auth/login + srik_session).
2. DATABASE_URL kembali ke branch Neon `main` (schema legacy tidak disentuh).
3. Sahkan /api/v1/auth/login berfungsi dengan akaun seed lama.
4. Branch dev-auth-v1-1 boleh dipadam bila tidak diperlukan.
```

Had: akaun yang dicipta melalui Managed Auth (belum dipautkan) tidak akan mempunyai kata laluan legacy —
pautkan semula atau gunakan aliran jemputan selepas rollback.

---

## 6. Stage B — SELESAI (2026-11-01)

> Kelulusan pemilik direkod dalam `docs/releases/v1.1-PROD/STAGE_B_APPROVAL.md`; migration
> `0003_remove_legacy_auth` membuang `public.sessions` dan `profiles.password_hash`.
> Rollback selepas ini = restore DB (`rollback-pre-stage-b-20261101`) atau forward-fix.

```text
[x] Cutover production stabil (smoke 38/38, health 200 sepanjang cutover)
[x] Pengguna aktif dipautkan (1 profil ACTIVE, auth_user_id terisi)
[x] Tiada sesi legacy digunakan (jadual kosong; kod tidak lagi membacanya)
[x] Sandaran diambil sebelum DDL (dump + branch rollback-pre-stage-b-20261101)
[x] Kelulusan pemilik direkod

Migration B (dijalankan):
  DELETE FROM public.sessions;
  DROP TABLE public.sessions;
  ALTER TABLE profiles DROP COLUMN password_hash;
```

Selepas Stage B:
- buang `sessions` daripada `packages/db/src/schema.ts`,
- buang `AUTH_SECRET` daripada Vercel env, `.env.example` dan dokumen,
- kemas kini `README.md` dan laporan projek.

---

## 7. Definition of Done v1.1

```text
Authentication
[x] Managed Auth menjadi sumber identiti (dev)
[x] login / logout / restore session / reset kata laluan (UI + servis)
[x] pengesahan kata laluan custom tidak lagi digunakan
[x] production cutover (2026-10-31)

Application identity
[x] profiles.auth_user_id memautkan identiti
[x] unlinked / INVITED / SUSPENDED / DISABLED / roleless = sifar akses (diuji)

User management
[x] ADMIN boleh menjemput TEACHER
[x] jemputan tamat tempoh (72 jam), boleh dibatalkan, boleh dihantar semula
[x] onboarding memaut secara transaksi
[x] role ditetapkan server-side
[x] LAST_ADMIN dilindungi (409)

Authorization
[x] set permission ADMIN betul
[x] set permission TEACHER betul
[x] record scope guru kekal
[x] permission akademik domain-specific
[x] bypass API langsung gagal (401/403)

Security
[x] tiada rahsia dalam bundle klien (gate CI)
[x] rate limiting pada /users/* dan /onboarding/*
[x] audit dependensi tidak lagi diabaikan
[ ] CSP dikuatkuasakan di hosting (selepas semakan origin auth)

UI
[x] modul Pengguna hanya aktif selepas lengkap
[x] laluan /app tidak dikenali → 404
[x] tiada CTA pendaftaran awam
[x] keadaan unlinked/suspended/disabled eksplisit

Database
[x] Migration A diuji pada branch Neon
[x] skema auth lama dikekalkan
[x] cleanup destruktif dalam migration berasingan (belum dijalankan)
```
