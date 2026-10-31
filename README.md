# SRIK-Portal

Portal Pengurusan Sekolah Rendah Islam Al-Khairiah (SRIK) — single-school modular monolith,
satu deployment Vercel.

- Blueprint rujukan: `docs/preserved/SRIK_PORTAL_ARCHITECTURE_MIGRATION_BLUEPRINT_v1.0.md`
- Frontend: Vite + React + TypeScript + Tailwind (PWA online-first)
- API: Hono + Zod, di-serve sebagai Vercel Function dalam projek yang sama (`apps/web/api/handler.ts`)
- DB: Neon PostgreSQL + Drizzle ORM (`packages/db`)

## Struktur

```text
apps/web/
  api/handler.ts        Vercel Function  -> /api/v1/*
  src/server/           Hono app, auth, routes, policy
  src/app/              router, portfolio registry, providers, landings
  src/features/         skrin per domain
  src/components/       layout + ui
packages/
  db/                   Drizzle schema, migrations, seed
  shared/               senarai permission (satu sumber kebenaran)
docs/preserved/         blueprint v1.0 (read-only)
```

## Setup

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
SEED_ADMIN_PASSWORD='<strong-password>' pnpm db:seed
pnpm dev            # http://localhost:5173 (API ikut sekali, tiada proses kedua)
```

## Skrip

| Command | Kegunaan |
|---|---|
| `pnpm dev` | Vite + API dalam proses yang sama |
| `pnpm lint` / `pnpm typecheck` | tsc semua package |
| `pnpm test` | node:test — permission matrix, registry nav, auth helpers, kontrak API |
| `pnpm build` | build PWA (`dist/`) |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Drizzle |

## Status fasa

| Fasa | Status |
|---|---|
| 2 — Empat portfolio (registry, sidebar, breadcrumb, i18n ms/en, landing) | siap |
| 3 — DB foundation (Neon, Drizzle, constraint, seed) | siap |
| 4 — Auth (cookie HttpOnly + scrypt), RBAC permission + record scope, audit log | siap |
| 5 — Master data (staf, murid, waris, tahun, kelas, subjek, agihan) | API + skrin asas |
| 6 — Kehadiran murid (upsert harian, scope guru) | API + skrin asas |
| 7+ — Jadual, peperiksaan, portal waris/murid, kokurikulum penuh | belum (placeholder jujur) |

## Prinsip yang dikuatkuasakan

- Authorization di server: `requirePermission()` + `scopedClassIds()` / `scopedStudentIds()`.
  Guru hanya nampak murid dalam kelas yang dia ajar atau kelas seliaan.
- Registry frontend hanya navigasi — bukan keselamatan.
- Constraint DB: `student_no`, `staff_no`, `(student, attendance_date)`, `(student, academic_year)`,
  `(class, day, period)`, partial unique `academic_years_single_current`.
- Operasi sensitif ditulis ke `audit_log`; password/token tidak pernah dilog.
- Session token disimpan sebagai hash SHA-256.
- PWA cache shell sahaja; semua `/api/*` = `NetworkOnly`.

## Deploy

Projek Vercel `srik-portal` (root `apps/web`), di-link ke `TheGoodFeederX/SRIK-Portal`.
Env yang diperlukan: `DATABASE_URL`, `AUTH_SECRET`, `CORS_ORIGINS`.

## Migrasi repo asal

`anwarhakim31/School-Management` = rujukan UI/workflow sahaja (Phase 0 audit belum dijalankan —
lihat blueprint §34/§46). Tiada kod Express/Mongo dibawa masuk.
