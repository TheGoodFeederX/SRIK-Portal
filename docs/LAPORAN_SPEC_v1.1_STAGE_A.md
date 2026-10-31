# Laporan Pelaksanaan — Spec v1.1, Stage A

**Projek:** Portal Pengurusan Sekolah Rendah Islam Al-Khairiah (SRIK-Portal)
**Skop:** `SRIK_PORTAL_IMPLEMENTATION_SPEC_v1.1.md` — Phase 4 Completion (AUTH-1…AUTH-5, CLEAN-1…CLEAN-3)
**Tarikh:** 31 Oktober 2026
**Branch:** `feature/neon-auth-v1-1` (dipush, **belum merge**, **belum deploy production**)
**Keputusan seni bina:** ADR-1.1-AUTH — Managed Better Auth melalui Neon Auth

---

## 1. Ringkasan

Authentication custom SRIK (scrypt + cookie `srik_session`) digantikan dengan **Managed Better Auth** daripada Neon. Authorization kekal milik aplikasi: `profiles` → `user_roles` → permission → record scope. Jambatan identiti ialah `profiles.auth_user_id` (UNIQUE); foreign key domain (`staff.profile_id`, `guardians.profile_id`, `audit_log.actor_id`) tidak disentuh.

Semua kerja diuji pada Neon branch berasingan (`dev-auth-v1-1`), bukan `main`. Production masih berjalan dengan auth legacy.

| Metrik | Nilai |
|---|---|
| Commit pada branch | 3 |
| Fail berubah | 60 (+5 096 / −323) |
| Fail baharu | 24 |
| Fail dibuang | 2 (`password.ts`, `password.test.ts`) |
| Typecheck | 4/4 package lulus |
| Unit test | 19/19 lulus (+9 di `packages/shared` = 28) |
| Integration test | 12/12 lulus (branch dev) |
| Build | lulus (web + `api-dist/app.js` 480 kB) |
| Production | tidak disentuh — `GET /api/v1/health` → 200 |

---

## 2. Status mengikut fasa spec

| Fasa | Skop | Status | Bukti |
|---|---|---|---|
| 4.1 | Git `feature/neon-auth-v1-1` + Neon `dev-auth-v1-1` | ✅ | branch `br-sparkling-king-b3o5hkms` |
| 4.2 | Provision Managed Auth | ✅ | `auth_provider=better_auth`, `schema_name=neon_auth` |
| 4.3 | Schema bridge (Migration A) | ✅ | `0001_worried_ravenous.sql` |
| 4.4 | Frontend auth | ✅ | sign-in/out/reset diuji |
| 4.5 | Server identity bridge | ✅ | semua route lindung guna konteks baharu |
| 4.6 | Admin bootstrap | ✅ | dev admin dipautkan + disahkan |
| 4.7 | Users & invitations | ✅ | jemputan → terima → role (API diuji) |
| 4.8 | Academic permissions | ✅ | `student.read` tidak lagi jadi proksi |
| 4.9 | Hardening | ✅ | rate limit, header, gate CI, 404 shell |
| 4.10 | **Production cutover** | ❌ | menunggu kelulusan pemilik |
| 4.11 | **Legacy removal (Stage B)** | ❌ | skema legacy sengaja dikekalkan |

---

## 3. Perubahan mengikut workstream

### 3.1 AUTH-1 — Asas Managed Auth

| Item | Perincian |
|---|---|
| Fail | `neon.ts`, `apps/web/src/lib/auth-client.ts`, `apps/web/.env.example` |
| SDK | `@neon/neon-js@0.10.2` (`createAuthClient` + `BetterAuthVanillaAdapter`) |
| Provision | `POST /api/v2/projects/{p}/branches/{b}/auth` → `{"auth_provider":"better_auth"}` |
| Konfigurasi | nama aplikasi `Portal SRIK`; `disable_sign_up: true`; trusted domain `http://localhost:5173` + preview branch |
| E-mel | provider `shared` (`auth@mail.myneon.app`) — mencukupi untuk dev, perlu diganti sebelum production |

Satu klien auth sahaja di seluruh aplikasi (spec §17); tiada instantiation per komponen.

### 3.2 AUTH-2 — Jambatan identiti aplikasi

**Migration A** (`packages/db/migrations/0001_worried_ravenous.sql`):

```sql
CREATE TYPE invitation_status AS ENUM ('PENDING','ACCEPTED','EXPIRED','CANCELLED');
CREATE TABLE account_invitations (...);
ALTER TABLE profiles ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN status SET DEFAULT 'INVITED';
ALTER TABLE profiles ADD COLUMN auth_user_id text;
CREATE UNIQUE INDEX account_invitations_pending_email ON account_invitations (email) WHERE status = 'PENDING';
ALTER TABLE profiles ADD CONSTRAINT profiles_auth_user_id_unique UNIQUE (auth_user_id);
```

**Rantaian identiti:**

```text
neon_auth.user.id
  → profiles.auth_user_id (UNIQUE)
  → profiles.id
  → user_roles / staff.profile_id / guardians.profile_id / audit_log.actor_id
```

**Modul server:**

| Fail | Tanggungjawab |
|---|---|
| `apps/web/src/server/auth/identity.ts` | `verifyIdentity()` → `GET {NEON_AUTH_BASE_URL}/get-session`; baca cookie `__Secure-neon-auth.session_token` atau bearer |
| `apps/web/src/server/auth/application-user.ts` | `resolveApplicationUser()` → profil, status, role, permission |
| `apps/web/src/server/auth/session.ts` | middleware `loadApplicationUser`, `requireUser`, `requirePermission` |
| `apps/web/src/server/invitation-policy.ts` | TTL 72 jam, `isExpired`, `activeAdminCount` |
| `apps/web/src/server/rate-limit.ts` | fixed-window limiter |
| `apps/web/src/server/routes/auth.ts` | `GET /auth/session`, `POST /auth/logout` |
| `apps/web/src/server/routes/users.ts` | pengurusan pengguna + jemputan |
| `apps/web/src/server/routes/onboarding.ts` | penerimaan jemputan transaksi |

**Penafian akses eksplisit (spec §50–52, §93):**

| Keadaan | Kod | HTTP |
|---|---|---|
| Tiada identiti sah | `AUTH_REQUIRED` | 401 |
| Identiti tanpa profil | `APP_PROFILE_NOT_LINKED` | 403 |
| Profil `INVITED` | `APP_ACCOUNT_INVITED` | 403 |
| Profil `SUSPENDED` | `APP_ACCOUNT_SUSPENDED` | 403 |
| Profil `DISABLED` | `APP_ACCOUNT_DISABLED` | 403 |
| Profil tanpa role | `APP_ROLE_NOT_ASSIGNED` | 403 |
| Role tanpa permission | `FORBIDDEN` | 403 |
| Jemputan tamat | `INVITATION_EXPIRED` | 409 |
| Jemputan tiada/digunakan | `INVITATION_NOT_FOUND` | 403/404 |
| Emel tidak sepadan | `INVITATION_EMAIL_MISMATCH` | 403 |
| Identiti sudah dipautkan | `AUTH_ALREADY_LINKED` | 409 |
| Pentadbir terakhir | `LAST_ADMIN` | 409 |

Tiada profil dicipta secara automatik pada login pertama.

### 3.3 AUTH-3 — Jemputan dan pengurusan akaun

**API** (semua memerlukan `system.user.manage` kecuali onboarding):

```text
GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users/invitations
POST   /api/v1/users/invitations/:id/resend
POST   /api/v1/users/invitations/:id/cancel
PUT    /api/v1/users/:id/roles
POST   /api/v1/users/:id/suspend
POST   /api/v1/users/:id/reactivate
POST   /api/v1/users/:id/disable
GET    /api/v1/onboarding/status
POST   /api/v1/onboarding/accept
```

**Aliran cipta akaun guru:**

```text
ADMIN pilih staff (belum berpaut)
  → profil dicipta: status INVITED, auth_user_id NULL
  → staff.profile_id dipautkan
  → account_invitations PENDING (72 jam)
  → guru log masuk / onboarding
  → transaksi: klaim jemputan → paut auth_user_id → ACTIVE → role TEACHER
  → audit USER_LINKED_AUTH
```

**Jaminan transaksi penerimaan** (spec §63):

1. Klaim jemputan dengan `UPDATE … WHERE status='PENDING'` (hanya satu penerimaan berjaya, selamat di bawah konkurensi).
2. Tolak jika identiti sudah dipautkan ke profil lain.
3. `SELECT … FOR UPDATE` pada profil.
4. Semak emel sepadan.
5. Set `auth_user_id`, `status=ACTIVE`, sisip role (`onConflictDoNothing`), paut staff.
6. Tulis audit.

Sebarang kegagalan → rollback penuh.

**Audit event baharu:** `USER_INVITED`, `INVITATION_RESENT`, `INVITATION_CANCELLED`, `USER_LINKED_AUTH`, `USER_ROLE_ASSIGNED`, `USER_SUSPENDED`, `USER_REACTIVATED`, `USER_DISABLED`.

**UI:** `/app/administration/users` — lajur Nama, Emel, Guru, Role, Status, Pautan Auth, Jemputan, Tindakan. Tiada kata laluan dipaparkan. `admin.users` bertukar `deferred` → `available`.

### 3.4 AUTH-4 — Pengukuhan sesi dan keselamatan

| Item | Pelaksanaan |
|---|---|
| Logout | `authClient.signOut()` → `POST /auth/logout` → `qc.clear()` → `/login` |
| Invalidasi cache | `qc.clear()` pada logout (data pengguna terdahulu tidak kekal) |
| Rate limit | `/users/*` 30/minit, `/onboarding/*` 20/minit, kunci = auth user id (fallback IP) |
| Header | `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`, `Cache-Control: no-store` |
| CORS | senarai `CORS_ORIGINS` sahaja, `credentials: true`, tiada wildcard |
| Log | `requestId`, laluan, mesej ralat; tiada kata laluan/token/cookie |
| CSP | **belum dikuatkuasakan** — perlu semakan origin Managed Auth dahulu (didokumenkan) |
| Gate CI | audit `critical` gagal; audit `high` gagal melainkan dalam allowlist (`scripts/audit-gate.mjs`) |
| Gate bundle | CI gagal jika bundle klien mengandungi `npg_`, `napi_`, `secret_server_key`, `NEON_AUTH_BASE_URL` |

### 3.5 AUTH-5 — Refactor permission akademik

Permission baharu (spec §33):

```text
academic.year.read        academic.year.manage
academic.class.read       academic.class.manage
academic.subject.read     academic.subject.manage
academic.assignment.read  academic.assignment.manage
timetable.read
```

Reserved (tidak diberi kepada mana-mana role, diuji): `timetable.manage`, `exam.read`, `exam.manage`, `exam.marks.write`, `exam.marks.review`, `exam.marks.approve`, `exam.publish`.

| Peranan | Jumlah permission |
|---|---|
| ADMIN | 17 (semua yang dimiliki) |
| TEACHER | 9 (read + kehadiran; tiada `*.manage`, tiada `system.*`) |

Route akademik kini guna `academic.*.read` dan bukan lagi `student.read`. Registry: `academic.classes` → `academic.class.read`, `academic.subjects` → `academic.subject.read`, `academic.timetable` → `timetable.read`.

Record scope guru **tidak berubah**: `teaching_assignments` ∪ `classes.class_teacher_id`.

### 3.6 CLEAN — Pembersihan

| Item | Status |
|---|---|
| Shell 404 (`/app/*` tidak dikenali) | ✅ route `*` → `NotFoundPage inShell` |
| Legacy auth code | ✅ `password.ts`, `password.test.ts`, endpoint `POST /auth/login`, cookie `srik_session` dibuang |
| Legacy schema | ⚠️ **dikekalkan** (`public.sessions`, `profiles.password_hash`) untuk rollback Stage A |
| Seed | ✅ tidak lagi menyimpan kata laluan; hanya profil + role ADMIN |
| Env lama | ✅ `AUTH_SECRET` dan `SEED_ADMIN_PASSWORD` dibuang daripada `.env.example` dan README |

---

## 4. Pengesahan

### 4.1 Unit (tiada DB, tiada servis auth)

```text
apps/web/src/server/identity.test.ts       8/8   pemetaan payload, cookie, 401, rangkaian gagal, tiada baseUrl
apps/web/src/server/app.test.ts            7/7   health, signed-out, 401 AUTH_REQUIRED pada 6 route,
                                                  /auth/login → 404, onboarding 401, tiada stack trace
apps/web/src/app/navigation/registry.test.ts 4/4 portfolio, id/path unik, guru tanpa audit, anon tiada menu
packages/shared/src/permissions.test.ts    9/9   semua permission diberi, reserved tidak diberi,
                                                  TEACHER terhad, normalization emel
```

### 4.2 Integration (Neon branch dev sahaja)

```text
apps/web/src/server/application-user.test.ts  6/6   unlinked, INVITED, SUSPENDED, DISABLED,
                                                    roleless, ACTIVE TEACHER → permission betul
apps/web/src/server/invitations.test.ts       6/6   TTL = 72 jam, satu PENDING per emel,
                                                    jemputan dibatalkan tidak menyekat, satu auth ≠ dua profil,
                                                    kiraan admin aktif, normalisasi emel
```

Arahan:

```bash
SRIK_INTEGRATION=1 DATABASE_URL=$DEV_DATABASE_URL \
  node --test --experimental-strip-types \
  apps/web/src/server/{application-user,invitations}.test.ts
```

### 4.3 End-to-end pada branch dev

```text
POST {NEON_AUTH_BASE_URL}/sign-in/email                      200
GET  /api/v1/auth/session                                    200  state=authenticated-active, roles=["ADMIN"]
GET  /api/v1/users                                           200
GET  /api/v1/academic-years                                  200
GET  /api/v1/meta/summary                                    200
POST /api/v1/staff                                           201
POST /api/v1/users/invitations                               201  (profil INVITED + staff dipautkan)
POST /api/v1/users/invitations/:id/resend                    201  (dibatalkan → PENDING baharu)
POST /api/v1/users/invitations/:id/cancel                    404  INVITATION_NOT_FOUND (selepas resend, betul)
POST /api/v1/users/:uuid/suspend                             404  (id tidak wujud)
POST /api/v1/users/not-a-uuid/suspend                        400  VALIDATION
```

### 4.4 Keselamatan

```text
anon → /api/v1/students              401 AUTH_REQUIRED
legacy /api/v1/auth/login            404
bundle klien                         tiada npg_ / napi_ / secret_server_key / NEON_AUTH_BASE_URL
production                           tidak disentuh (health 200, auth legacy)
```

---

## 5. Isu yang ditemui semasa pelaksanaan

| Isu | Punca | Penyelesaian |
|---|---|---|
| `sign-in/email` → 401 untuk admin | Akaun dicipta melalui Admin API tanpa `password` | Hash `scrypt` format Better Auth ditulis pada dev (`salt:key`); production mesti guna aliran reset emel |
| `verifyIdentity` → `invalid` untuk token sah | Token di-`encodeURIComponent` dua kali | Hantar nilai cookie **sebagaimana diterima** (API Gateway menandatangani nilai berkod) |
| Nama cookie salah | Managed Auth guna `__Secure-neon-auth.session_token` | Senarai calon nama cookie + ujian unit |
| `get-session` kosong dengan `Bearer` | Better Auth hanya baca token dari cookie | Hantar sebagai cookie, bukan header bearer |
| Hono `response.headers.forEach` tanpa tipe | lib DOM vs @types/node | Anotasi eksplisit `(value: string, key: string)` |
| `api:typecheck` guna DB pool menggantung | `createDb` dalam ujian | Ujian guna `createDb` + `SRIK_INTEGRATION` gate; integration berasingan |
| Dev server tidak nampak `NEON_AUTH_BASE_URL` | `ssrLoadModule` tidak memuat `.env` server | `process.env.NEON_AUTH_BASE_URL ??= VITE_NEON_AUTH_URL` dalam plugin Vite |
| Migration `DROP TABLE sessions` terhasil automatik | Lajur legacy dibuang dari schema Drizzle | Schema legacy dikekalkan + komen; cleanup hanya dalam Stage B |
| Import test mengheret seluruh app | `invitations.test.ts` import `routes/users.ts` | Dasar/guard dipindah ke `invitation-policy.ts` (modul bebas) |

---

## 6. Risiko dan perkara tertunggak

### 6.1 Perlu keputusan pemilik

| # | Item | Nota |
|---|---|---|
| 1 | Cutover production (Stage A ke `main`) | Perlu backup/recovery point, domain production didaftarkan, admin production dipautkan |
| 2 | Stage B (destruktif) | `DELETE FROM public.sessions`, `DROP COLUMN profiles.password_hash`, `DROP TABLE public.sessions` |
| 3 | Rotasi kredensial | Token GitHub/Neon/Vercel dalam lampiran asal; kata laluan dev `SrikAdmin2026!` diketahui dalam log |

### 6.2 Tertunggak teknikal

```text
- CSP enforcement belum (perlu senarai origin neonauth + ujian connect-src)
- E-mel production: provider shared Neon; perlu sender/branding sekolah sebelum roll out
- Rate limiter in-memory per-instance (cukup untuk MVP; naik taraf kepada edge/provider bila perlu)
- UI tindakan "Hantar semula" jemputan belum didedahkan dalam jadual (API sudah ada; perlu id jemputan per baris)
- `CSRF` mengikut panduan Managed Auth; tiada token tersendiri dibina (didokumenkan)
- Sentry, backup automatik, restore drill masih belum (Production Data Gate spec §98)
```

### 6.3 Had Stage A yang diketahui

- Skema legacy masih ada dalam DB (sengaja). Jika rollback, akaun yang dicipta melalui Managed Auth tanpa kata laluan legacy perlu dipautkan semula.
- `emailVerified` tidak diwajibkan (spec §42 membenarkan dengan syarat checks aplikasi mandatori — dipenuhi).
- Preview deployment Vercel dilindungi Vercel Authentication; ujian preview perlu `vercel curl` atau matikan perlindungan.

---

## 7. Fail utama

| Fail | Perubahan |
|---|---|
| `neon.ts` | `defineConfig({ auth: true })` |
| `packages/db/src/schema.ts` | `authUserId`, `invitationStatusEnum`, `accountInvitations`, `status` lalai `INVITED`, `passwordHash` nullable |
| `packages/db/migrations/0001_worried_ravenous.sql` | Migration A |
| `packages/db/src/seed.ts` | Tiada kata laluan; profil + role sahaja |
| `packages/shared/src/permissions.ts` | Permission akademik + `RESERVED_PERMISSIONS` |
| `packages/shared/src/auth-codes.ts` | Kod ralat stabil + `AppAuthState` + `normalizeEmail` |
| `apps/web/src/lib/auth-client.ts` | Klien Managed Auth tunggal |
| `apps/web/src/app/providers/auth.tsx` | 8 state + `signOut` + `refresh` |
| `apps/web/src/app/router/AppRouter.tsx` | `RequireActive`, onboarding, reset, 404 shell |
| `apps/web/src/features/auth/*` | Login, Forgot/Reset, Onboarding, AccountState |
| `apps/web/src/features/administration/UsersPage.tsx` | UI pengguna, jemputan, role, suspend |
| `apps/web/src/server/auth/*` | identity, application-user, session |
| `apps/web/src/server/routes/users.ts` | API pengguna + `LAST_ADMIN` |
| `apps/web/src/server/routes/onboarding.ts` | Terima jemputan transaksi |
| `apps/web/src/server/invitation-policy.ts` | TTL + kiraan admin |
| `apps/web/src/server/rate-limit.ts` | Limiter |
| `.github/workflows/ci.yml` | Gate audit + gate rahsia bundle |
| `scripts/audit-gate.mjs` | Allowlist `high`/`critical` |
| `docs/security/AUTH_SECURITY.md` | Sempadan, CORS/CSRF, header, env |
| `docs/runbooks/BOOTSTRAP_ADMIN.md` | Runbook admin |
| `docs/migrations/AUTH_MIGRATION_v1.1.md` | Stage A/B, rollback, DoD |

---

## 8. Kesimpulan

Stage A Spec v1.1 selesai sepenuhnya pada branch berasingan: Managed Better Auth menyediakan identiti, aplikasi mengekalkan kuasa authorization, dan setiap identiti yang tidak memenuhi syarat (tiada pautan, dijemput, digantung, dinyahaktifkan, tiada role) menerima sifar akses melalui kod ralat yang stabil dan diuji.

Production kekal pada auth legacy dan tidak terjejas. Dua keputusan menunggu pemilik: **cutover production** dan **pembersihan destruktif Stage B**.
