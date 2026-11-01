# Laporan Projek SRIK-Portal

**Tarikh laporan:** 31 Oktober 2026
**Berdasarkan:** `docs/preserved/SRIK_PORTAL_ARCHITECTURE_MIGRATION_BLUEPRINT_v1.0.md`
**Status:** Asas projek siap dan beroperasi dalam production (Fasa 1–6 separa)

---

## 1. Ringkasan Eksekutif

Portal Pengurusan Sekolah Rendah Islam Al-Khairiah (SRIK) telah dibina dari kosong sehingga boleh digunakan dalam production. Asas projek — repositori, database, deployment — siap dan dihubungkan. Fasa 2 hingga 6 blueprint selesai separa; Fasa 7 ke atas belum bermula.

| Item | Status |
|---|---|
| Repositori GitHub | ✅ `TheGoodFeederX/SRIK-Portal` (main) |
| Database Neon | ✅ `srik-portal` (PostgreSQL 17, aws-ap-southeast-1) |
| Deployment Vercel | ✅ https://srik-portal.vercel.app |
| Login production | ✅ Berfungsi (admin seed) |
| CI pipeline | ✅ Dikonfigurasi |
| Ujian automatik | ✅ 18/18 lulus |
| Typecheck | ✅ 4/4 package lulus |
| Build | ✅ Lulus (web + API bundle) |

---

## 2. URL dan Akses

| Perkhidmatan | URL / ID |
|---|---|
| Aplikasi | https://srik-portal.vercel.app |
| API | https://srik-portal.vercel.app/api/v1 |
| GitHub Repo | https://github.com/TheGoodFeederX/SRIK-Portal |
| Neon Project | `proud-butterfly-12664976` (`srik-portal`) |
| Vercel Project | `prj_iu7na3eTmTtjhOP8ysLAUlQdMkrC` (`srik-portal`) |

**Akaun admin sementara:**

```text
Emel        : admin@srik.local
Kata laluan : SrikAdmin2026!
```

> **Dikemas kini oleh Spec v1.1:** kata laluan seed custom telah dimansuhkan. Identiti admin kini
> dikendalikan Managed Better Auth — lihat `docs/runbooks/BOOTSTRAP_ADMIN.md`. Deployment production
> masih memakai auth legacy sehingga cutover Stage A dijalankan.

---

## 3. Seni Bina Yang Dilaksanakan

```text
Pengguna (desktop / tablet / telefon / PWA)
  │
  ▼
Vercel — satu projek (root: apps/web)
   ├── Static : Vite React SPA (dist/)
   └── Function: api/handler.ts → api-dist/app.js (Hono, dibundle)
  │
  ▼
Neon PostgreSQL (Drizzle ORM, constraints)
```

### 3.1 Struktur Repositori

```text
SRIK-Portal/
├─ apps/web/
│  ├─ api/handler.ts         # Vercel Node function (jambatan req/res → Hono)
│  ├─ api-dist/              # Hasil bundle API (gitignored)
│  ├─ src/server/            # Hono app, auth, routes, policy
│  ├─ src/app/               # Router, registry portfolio, providers, landings
│  ├─ src/features/          # Skrin per domain
│  ├─ src/components/        # Layout + UI
│  ├─ src/i18n/              # ms (utama) + en (fallback)
│  └─ vite.config.ts         # Vite + PWA + dev API middleware
├─ packages/db/              # Drizzle schema, migrations, seed
├─ packages/shared/          # Senarai permission (satu sumber kebenaran)
├─ docs/preserved/           # Blueprint v1.0 (rujukan)
└─ .github/workflows/ci.yml
```

### 3.2 Stack

| Lapisan | Teknologi |
|---|---|
| Build | Vite 6 |
| UI | React 18, TypeScript 5, Tailwind 3 |
| Router | React Router 7 |
| Server state | TanStack Query 5 |
| Ikon / util | Lucide, clsx, tailwind-merge |
| PWA | vite-plugin-pwa + Workbox |
| API | Hono 4 + Zod |
| ORM | Drizzle ORM 0.38 + Drizzle Kit |
| DB | Neon PostgreSQL 17 |
| Auth | scrypt + cookie session (HttpOnly) |
| Runtime Vercel | Node 22.x |

---

## 4. Status Fasa Blueprint

| Fasa | Skop | Status |
|---|---|---|
| 0 | Audit repo `anwarhakim31/School-Management` | ❌ Belum |
| 1 | Project skeleton + CI | ✅ Siap |
| 2 | Empat portfolio UI | ✅ Siap |
| 3 | Database foundation | ✅ Siap |
| 4 | Auth & authorization (v1.1 Managed Auth) | ⚠️ Stage A siap pada branch dev |
| 5 | Core master data | ⚠️ API + skrin senarai sahaja |
| 6 | Kehadiran murid | ⚠️ API + skrin ambil kehadiran |
| 7 | Jadual | ❌ Placeholder |
| 8 | Peperiksaan | ❌ Placeholder |
| 9 | PWA & hardening | ⚠️ PWA asas; Sentry/backup belum |
| 10 | Modul masa depan | ❌ Belum |

---

## 5. Ciri Yang Berfungsi

### 5.1 Navigasi Empat Portfolio

| Portfolio | Submodul `available` | Submodul placeholder / deferred |
|---|---|---|
| Pentadbiran | Guru & Staf, Log Audit | Kehadiran Staf, Kewangan, Pengguna (deferred) |
| Akademik | Tahun & Kelas | Subjek, Jadual, Peperiksaan (placeholder) |
| HEM | Murid & Waris, Kehadiran Murid | Disiplin, Kebajikan (deferred) |
| Kokurikulum | — | Unit, Rumah, Aktiviti, Pencapaian (placeholder) |

**Aturan dikuatkuasakan:**

- Hanya `readiness: 'available'` muncul dalam menu operasi.
- Registry frontend bukan authorization — API tetap semak server-side.
- Placeholder tidak menyamar sebagai modul aktif; papar empty-state jujur.

### 5.2 Database (22 jadual)

| Domain | Jadual |
|---|---|
| Identity | `profiles`, `user_roles`, `sessions`, `login_audit`, `audit_log` |
| Staf | `staff`, `staff_attendance` |
| Murid | `students`, `guardians`, `student_guardians` |
| Akademik | `academic_years`, `classes`, `enrollments`, `subjects`, `teaching_assignments`, `timetable_entries` |
| Kehadiran | `student_attendance` |
| Peperiksaan | `exams`, `exam_subjects`, `exam_marks` |

**Constraint dikuatkuasakan di DB (bukan UI):**

```text
students.student_no                                    UNIQUE
staff.staff_no                                         UNIQUE
(student_id, attendance_date)                          UNIQUE
(student_id, academic_year_id)                         UNIQUE
(class_id, day_of_week, period_no)                     UNIQUE
(academic_year_id, teacher_id, class_id, subject_id)   UNIQUE
academic_years (is_current) WHERE is_current AND status='ACTIVE'   UNIQUE (partial)
```

### 5.3 Auth & Authorization

**Aliran login:**

```text
POST /auth/login
  → verify scrypt
  → cipta session token rawak
  → simpan SHA-256(token) dalam DB
  → Set-Cookie HttpOnly; SameSite=Lax; Secure(prod)
```

**Role dan permohonan permission:**

| Permission | ADMIN | TEACHER |
|---|---|---|
| `staff.read` | ✅ | ✅ |
| `staff.write` | ✅ | ❌ |
| `student.read` | ✅ | ✅ (scope kelas) |
| `student.write` | ✅ | ❌ |
| `attendance.student.take` | ✅ | ✅ (scope kelas) |
| `attendance.student.read` | ✅ | ✅ (scope kelas) |
| `academic.*.manage` | ✅ | ❌ |
| `system.audit.read` | ✅ | ❌ |
| `system.user.manage` | ✅ | ❌ |

**Record scope guru:** guru hanya nampak murid dalam kelas yang dia ajar (`teaching_assignments`) atau kelas seliaan (`classes.class_teacher_id`). Guru tanpa rekod staf nampak sifar rekod.

### 5.4 API (`/api/v1`)

| Kaedah | Laluan | Permission |
|---|---|---|
| GET | `/health` | awam |
| POST | `/auth/login` | awam |
| GET | `/auth/session` | awam (null jika tiada sesi) |
| POST | `/auth/logout` | sesi |
| GET | `/meta/summary` | `student.read` |
| GET / POST / PATCH | `/staff`, `/staff/:id` | `staff.read` / `staff.write` |
| GET / POST / PATCH | `/students`, `/students/:id` | `student.read` / `student.write` |
| POST | `/students/:id/guardians` | `student.write` |
| GET / POST | `/academic-years`, `/classes`, `/subjects`, `/teaching-assignments` | `*.manage` untuk tulis |
| GET / POST | `/attendance/students` | `attendance.student.read` / `.take` |
| GET | `/audit-log` | `system.audit.read` |

**Kontrak respons:**

```json
{ "data": {}, "meta": {}, "requestId": "..." }

{ "error": { "code": "FORBIDDEN", "message": "Anda tidak mempunyai akses.", "details": null }, "requestId": "..." }
```

Kod status digunakan dengan tepat:

| Kod | Maksud |
|---|---|
| `400` | ID atau data tidak sah |
| `401` | Tiada sesi |
| `403` | Tiada permission atau di luar scope |
| `404` | Rekod tidak wujud |
| `409` | Langgar constraint DB |
| `500` | Ralat pelayan (tanpa stack trace) |

### 5.5 PWA & Keselamatan

- `manifest.webmanifest` + service worker dijana; boleh dipasang pada telefon/desktop.
- Cache hanya app shell dan aset statik; semua `/api/*` = `NetworkOnly` (tiada data sensitif dicache).
- Cookie sesi `HttpOnly`, `SameSite=Lax`, `Secure` dalam production.
- Token sesi disimpan sebagai hash SHA-256 — bocoran DB tidak boleh dipakai semula.
- `audit_log` merekod create/update staf, murid, waris, agihan pengajaran, dan rekod kehadiran.
- Password dan token tidak pernah masuk log.

---

## 6. Pengesahan (Bukti)

### 6.1 Gate Tempatan

| Semakan | Arahan | Keputusan |
|---|---|---|
| Typecheck | `pnpm typecheck` | 4/4 lulus |
| Typecheck API | `pnpm --filter @srik/web api:typecheck` | lulus |
| Unit test | `pnpm test` | 18/18 lulus |
| Build | `pnpm build` | lulus (web 285 kB, API bundle 463 kB) |
| Migration idempotent | `pnpm db:migrate` ×2 | lulus, tiada ralat |

**Liputan ujian:**

```text
packages/shared   — matriks permission, dedupe, anon tanpa akses            (6)
apps/web server   — kontrak API anon, 400/401, tiada bocoran stack,
                    scrypt round-trip, hash token, validasi hex              (8)
apps/web registry — portfolio lengkap, id/path unik, guru tak nampak audit,
                    anon tiada menu                                         (4)
```

### 6.2 Ujian End-to-End Production

| Semakan | Keputusan |
|---|---|
| `GET /api/v1/health` | `200` |
| `POST /api/v1/auth/login` | `200` + cookie |
| `GET /api/v1/auth/session` | `200` dengan permission |
| `GET /api/v1/meta/summary` | `200` (murid 1, staf 1, kelas 2, tahun 1) |
| Staf / Murid / Kelas / Tahun / Audit / Kehadiran | semua `200` |
| Murid tanpa sesi | `401` |
| Cookie palsu | `401` |
| Cipta murid duplikat | `409` |
| Logout kemudian akses semula | `401` |
| Shell `/app/hem/students` | `200` (SPA fallback) |
| `/login` | `200` |

---

## 7. Keputusan Teknikal dan Rasional

| # | Keputusan | Sebab |
|---|---|---|
| 1 | API dalam projek Vercel **sama** dengan web | Dua projek pecahkan dependency graph pnpm; `drizzle-orm` dimuatkan dua kali |
| 2 | API **dibundle** (`vite.api.config.ts` → `api-dist/app.js`) | Bundler Vercel mencipta instance `drizzle-orm` kedua dan gagal typecheck |
| 3 | Handler jambatan req/res Node → `app.fetch` | `hono/vercel` hanya menerima web `Request`; invocation Vercel tergantung |
| 4 | Runtime dikunci melalui tipe `VercelRequest`/`VercelResponse` | Tanpa tipe, Vercel guna Node 24 dan fungsi gagal dimuat |
| 5 | Auth sendiri di atas `profiles` | Neon Auth tidak disediakan untuk projek ini; model pengguna blueprint kekal sama |
| 6 | Komponen gaya-shadcn ditulis sendiri | Elak dependency besar untuk enam komponen asas |
| 7 | `node:test` sebagai test runner | Stdlib; tiada Vitest/Jest sebelum perlu |
| 8 | Toast ~40 baris sendiri | Lebih murah daripada menambah dependency |
| 9 | `pnpm` dengan `nodeLinker: hoisted` | Satu instance setiap pakej merentas workspace |

---

## 8. Masalah Yang Dihadapi dan Penyelesaian

| Masalah | Punca | Penyelesaian |
|---|---|---|
| `hono/node-server` tidak ditemui | Hono 4.13 tiada subpath eksport itu | Guna pakej `@hono/node-server` |
| Dua instance `drizzle-orm` di Vercel | Pilihan peer dependency berbeza dalam graf Vercel | Bundle API pada build time |
| Fungsi `/api/*` tergantung 60s | `hono/vercel` `handle(app)` terima `Request`, bukan req/res Node | Jambatan manual req/res |
| Login `500` di production | Env `DATABASE_URL` belum diset pada projek web | Tambah `DATABASE_URL`, `AUTH_SECRET`, `CORS_ORIGINS` |
| Constraint DB pulang `500` | Ralat Postgres tidak dipetakan | Petakan `23505/23503/23514` → `409` |
| UUID tidak sah pulang `500` | Nilai terus ke query | Validasi `idParam()` → `400` |
| `verifyPassword('scrypt$zz$zz')` pulangkan `true` | Node truncate hex ganjil | Validasi hex sebelum `Buffer.from` |

Setiap isu di atas mempunyai ujian atau pengesahan yang berkaitan.

---

## 9. Risiko dan Perkara Tertunggak

### 9.1 Risiko Keselamatan — Keutamaan Tinggi

| Risiko | Tindakan |
|---|---|
| Kata laluan admin sementara diketahui dalam log | Tukar sebelum mana-mana data sebenar dimasukkan |
| Token GitHub/Neon/Vercel dalam fail lampiran | **Rotate ketiga-tiga token** |
| Tiada rate limiting pada `/auth/login` | Tambah sebelum production sebenar |
| `AUTH_SECRET` disimpan tetapi belum digunakan untuk tandatangan | Session guna token rawak ber-hash; kekalkan atau gunakan untuk token tamat tempoh |
| Tiada CSRF token eksplisit | Cookie `SameSite=Lax` sahaja pada masa ini |

### 9.2 Ciri Belum Selesai

```text
- Modul pengguna & jemputan (ADMIN cipta akaun guru)          → baki Fasa 4
- Skrin cipta murid/guru dalam UI (API sudah ada)
- Subjek, agihan pengajaran, jadual, peperiksaan, report card
- Portal waris/murid, PBD, kewangan, kokurikulum penuh
- Import Excel (preview → transaksi), export XLSX/PDF
- Sentry, backup automatik, restore drill, rate limiting
- Phase 0 audit repo School-Management
```

### 9.3 Risiko Teknikal

- `apps/web/src/app/router/AppRouter.tsx` masih ada route wildcard `LoadingState` sebagai fallback — perlu diganti `NotFoundPage` dalam konteks shell.
- Route akademik guna `student.read` untuk GET — sepatutnya permission akademik khusus.
- `audit_log` ditulis secara *best-effort*; kegagalan tidak menggagalkan transaksi (sengaja untuk MVP).

---

## 10. Cadangan Langkah Seterusnya

| Keutamaan | Tugas |
|---|---|
| 1 | Rotate token GitHub, Neon, Vercel; tukar kata laluan admin |
| 2 | Modul pengguna & jemputan (baki Fasa 4) + ujian privilege escalation |
| 3 | Skrin CRUD murid/guru lengkap dengan validasi Zod di UI |
| 4 | Modul subjek + agihan pengajaran (asas kepada jadual & peperiksaan) |
| 5 | Jadual waktu dengan pengesanan pertindihan guru/kelas |
| 6 | Peperiksaan: markah → REVIEW → APPROVED → PUBLISHED + audit |
| 7 | Rate limiting, Sentry, backup automatik + restore drill |
| 8 | Phase 0: audit repo asal → `REPO_AUDIT.md`, `ROUTE_INVENTORY.md`, `MIGRATION_MATRIX.md` |

---

## 11. Rujukan Fail Utama

| Fail | Kandungan |
|---|---|
| `README.md` | Setup, skrip, status fasa |
| `packages/db/src/schema.ts` | Definisi 22 jadual + constraint |
| `packages/db/src/migrate.ts` | Apply migration + partial unique index |
| `packages/db/src/seed.ts` | Akaun admin idempotent |
| `packages/shared/src/permissions.ts` | Senarai permission + peta role |
| `apps/web/src/server/app.ts` | Hono app, CORS, kontrak ralat, audit |
| `apps/web/src/server/auth/session.ts` | `requirePermission`, record scope |
| `apps/web/src/server/routes/*.ts` | Staff, students, academic, attendance, audit, meta |
| `apps/web/api/handler.ts` | Handler Vercel (jambatan req/res) |
| `apps/web/vite.api.config.ts` | Bundle API untuk production |
| `apps/web/src/app/navigation/portfolioRegistry.ts` | Registry empat portfolio |
| `apps/web/src/i18n/ms.ts`, `apps/web/src/i18n/en.ts` | Kamus BM / English |
| `.github/workflows/ci.yml` | Gate CI |
| `docs/preserved/SRIK_PORTAL_ARCHITECTURE_MIGRATION_BLUEPRINT_v1.0.md` | Blueprint v1.0 |

---

## 12. Kesimpulan

Asas projek SRIK-Portal siap dan beroperasi dalam production: satu deployment Vercel yang menyajikan UI empat portfolio dan API Hono ke atas Neon PostgreSQL, dengan authorization server-side (permission + record scope), constraint DB, audit log, dan 18 ujian automatik yang lulus.

Skop MVP teras (staf, murid, waris, tahun, kelas, kehadiran) tersedia melalui API; UI masih terhad kepada senarai dan pengambilan kehadiran. Langkah paling kritikal sebelum penggunaan sebenar ialah **rotasi kredensial** dan **modul pengurusan pengguna**.
