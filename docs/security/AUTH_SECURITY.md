# AUTH_SECURITY — SRIK Portal

**Berkuat kuasa:** Implementation Spec v1.1 (Phase 4)
**Status:** Stage A — Managed Auth aktif di branch `dev-auth-v1-1`; cutover production belum.

---

## 1. Sempadan authentication vs authorization

```text
Neon Managed Better Auth   →  siapa pengguna (kredensial, sesi, reset, pengesahan emel)
SRIK PostgreSQL (public.*) →  apa yang pengguna boleh buat (profil, role, permission, scope)
```

- Sesi Managed Auth yang sah **tidak** memberi akses SRIK.
- API menolak identiti yang belum dipautkan atau belum diberikan role.
- Data API Neon tidak digunakan; semua akses data melalui Hono API.

---

## 2. Identity bridge

```text
neon_auth.user.id  →  profiles.auth_user_id (UNIQUE)  →  profiles.id
                                                       →  user_roles / staff / guardians / audit
```

- `profiles.id` kekal sebagai identiti domain (FK tidak berubah).
- `profiles.auth_user_id` UNIQUE: satu identiti auth tidak boleh memaut dua profil.
- Migration A (`0001_*`) menambah lajur ini; migration B (belum dijalankan) akan drop `password_hash`
  dan `public.sessions`.

---

## 3. Aliran permintaan

```text
Browser
  │ cookie: __Secure-neon-auth.session_token
  ▼
Hono API (apps/web/src/server)
  ├─ auth/identity.ts        verifyIdentity()  →  GET {NEON_AUTH_BASE_URL}/get-session
  ├─ auth/application-user.ts resolveApplicationUser()
  │      tiada profil            → APP_PROFILE_NOT_LINKED      (403)
  │      INVITED                 → APP_ACCOUNT_INVITED         (403)
  │      SUSPENDED               → APP_ACCOUNT_SUSPENDED       (403)
  │      DISABLED                → APP_ACCOUNT_DISABLED        (403)
  │      tiada role              → APP_ROLE_NOT_ASSIGNED       (403)
  │      selainnya               → ApplicationUser + permissions
  ├─ requirePermission(...)      → 403 FORBIDDEN
  └─ scope (auth/... routes)     → guru: kelas diajar/seliaan sahaja
```

`GET /api/v1/auth/session` memulangkan salah satu:

```json
{ "data": { "state": "authenticated-active", "user": { "...": "..." } } }
{ "data": { "state": "authenticated-suspended", "code": "APP_ACCOUNT_SUSPENDED", "message": "...", "user": null } }
{ "data": { "state": "signed-out", "user": null } }
```

Tiada token, cookie atau kunci rahsia dipulangkan oleh endpoint ini.

---

## 4. CSRF dan origin

- Sesi disimpan dalam cookie yang dikawal Managed Auth (HttpOnly, Secure, SameSite dikawal servis).
- CORS API: hanya origin yang tersenarai dalam `CORS_ORIGINS`, tanpa wildcard, `credentials: true`.
- Setiap mutasi menyemak:
  1. identiti sah (Managed Auth),
  2. application access (profil + role),
  3. permission,
  4. record scope.
- CSRF token tersendiri **tidak** dibina; ikut panduan Managed Auth semasa (spec §54).
  Jika penemuan kemudian memerlukan double-submit token, dokumenkan di sini dahulu.

---

## 5. Rate limiting

| Laluan | Had | Kunci |
|---|---|---|
| `/api/v1/users/*` | 30 / minit | auth user id (fallback IP) |
| `/api/v1/onboarding/*` | 20 / minit | auth user id (fallback IP) |

- Log masuk dikendalikan Managed Auth (throttling provider), bukan endpoint SRIK.
- Pelaksanaan: fixed-window in-memory (`apps/web/src/server/rate-limit.ts`), per-instance.
  Naik taraf kepada edge/provider limiter bila trafik memerlukan.

---

## 6. Header keselamatan

API menetapkan:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Frame-Options: DENY
Cache-Control: no-store    (semua respons API)
```

**CSP belum dikuatkuasakan.** Sebelum enforcement:
1. senaraikan origin `https://*.neonauth.*.aws.neon.tech` yang digunakan,
2. uji `connect-src` terhadap sign-in, get-session dan password reset,
3. tetapkan dasar melalui `vercel.json` projek web, kemudian dokumenkan hasilnya di sini.

---

## 7. Rahsia dan env

| Nama | Di mana | Peraturan |
|---|---|---|
| `DATABASE_URL` | Vercel env (server) | rahsia, tidak pernah `VITE_*` |
| `NEON_AUTH_BASE_URL` | Vercel env (server) | server sahaja; URL awam tetapi tidak didedahkan |
| `VITE_NEON_AUTH_URL` | Vercel env + build | selamat untuk pelayar (URL servis auth) |
| `CORS_ORIGINS` | Vercel env | senarai origin yang dibenarkan |

`AUTH_SECRET` legacy **tidak lagi digunakan** oleh runtime selepas Stage A dan
akan dibuang daripada env/docs pada Stage B.

CI menyemak bundle klien supaya tidak mengandungi `npg_`, `napi_`, `secret_server_key` atau
`NEON_AUTH_BASE_URL`.

---

## 8. Log

Dibenarkan: `requestId`, `profileId`, kod hasil resolusi identiti, laluan.
Dilarang: kata laluan, cookie sesi, JWT, token pengesahan, token reset, kunci rahsia servis.

---

## 9. Senarai semak production auth

Rujuk `docs/migrations/AUTH_MIGRATION_v1.1.md` §6.

---

## 10. Same-origin auth transport (2026-11-01)

Managed Better Auth sets its session cookie on the host that answers the request. Serving the
auth client straight from the auth service host meant the browser stored
`__Secure-neon-auth.session_token` for that host, so `/api/v1` never received it and every
session looked signed-out.

```text
Browser → https://srik-portal.vercel.app/neonauth/*        (first-party origin)
        → /api/neonauth function  (apps/web/api/neonauth.ts)
        → https://<branch>.neonauth.<region>.aws.neon.tech/neondb/auth/*
```

- `apps/web/vercel.json` rewrites `/neonauth/:path*` → `/api/neonauth?p=:path*`.
- The proxy forwards only auth-relevant headers (`content-type`, `cookie`, `accept`, `origin`,
  `referer`, `user-agent`, `authorization`) and copies `Set-Cookie` verbatim. Host and
  `x-forwarded-*` must not be forwarded — the auth service rejects a foreign hostname
  (`INVALID_HOSTNAME`).
- The proxy contains **no** authentication logic: credentials and sessions remain owned by the
  Managed Auth service.
- `VITE_NEON_AUTH_URL` is the same-origin path; `NEON_AUTH_BASE_URL` stays the direct upstream
  URL for server-side verification.
- Development mirrors this with a Vite proxy for `/neonauth`.
