# SRIK-Portal

Portal Pengurusan Sekolah Rendah Islam Al-Khairiah (SRIK) — single-school modular monolith.

- Blueprint rujukan: `docs/preserved/SRIK_PORTAL_ARCHITECTURE_MIGRATION_BLUEPRINT_v1.0.md`
- UI: Vite + React + TypeScript + Tailwind (+ shadcn-style components in `apps/web/src/components/ui`)
- API: Hono + Zod on Vercel Functions (Node 22)
- DB: Neon PostgreSQL + Drizzle ORM

## Struktur

```text
apps/
  web/    Vite React PWA (portal UI, 4 portfolio)
  api/    Hono REST API  /api/v1  (also deployed as a Vercel function)
packages/
  db/       Drizzle schema, migrations, seed
  shared/   permissions (single source of truth), types
docs/       preserved blueprint
```

## Setup

```bash
pnpm install
cp .env.example .env   # DATABASE_URL, AUTH_SECRET, CORS_ORIGINS
pnpm db:migrate
SEED_ADMIN_PASSWORD='<strong-password>' pnpm db:seed
pnpm dev               # web :5173 (proxies /api), api :8787
```

## Skrip

| Command | Kegunaan |
|---|---|
| `pnpm lint` / `pnpm typecheck` | tsc di semua package |
| `pnpm test` | node:test — permissions, registry nav, auth helpers, API contract |
| `pnpm --filter @srik/web build` | build PWA (shell cache sahaja; API `NetworkOnly`) |
| `pnpm db:generate` | generate migration Drizzle |
| `pnpm db:migrate` | apply migrations + partial unique index tahun akademik |
| `pnpm db:seed` | cipta/refresh akaun admin |

## Fasa yang sudah dibina

| Fasa | Status |
|---|---|
| 2 — Empat portfolio (registry, sidebar, breadcrumb, i18n ms/en, landing) | siap |
| 3 — DB foundation (Neon, Drizzle, constraint, seed) | siap |
| 4 — Auth (session cookie HttpOnly, scrypt), RBAC permission + record scope, audit log | siap |
| 5 — Master data (staf, murid, waris, tahun, kelas, subjek, agihan) | API + skrin asas |
| 6 — Kehadiran murid (upsert harian, scope guru) | API + skrin asas |
| 7+ — Jadual, peperiksaan, PWA offline, kokurikulum | belum (placeholder jujur) |

## Prinsip yang dikuatkuasakan

- Authorization di server: `requirePermission()` + `scopedClassIds()` / `scopedStudentIds()`.
  Guru hanya nampak murid dalam kelas yang dia ajar atau kelas seliaannya.
- Registry frontend hanya untuk navigasi — bukan keselamatan.
- DB constraint: `UNIQUE(student_no)`, `UNIQUE(staff_no)`, `UNIQUE(student, attendance_date)`,
  `UNIQUE(student, academic_year)`, partial unique `academic_years_single_current`.
- Sensitive ops ditulis ke `audit_log`. Password/session token tidak pernah dilog.
- Session token disimpan sebagai SHA-256 hash dalam DB.

## Deploy (Vercel)

Dua projek Vercel dari repo yang sama:

| Projek | Root Directory | Env |
|---|---|---|
| `srik-portal` (web) | `apps/web` | — |
| `srik-portal-api` | `apps/api` | `DATABASE_URL`, `AUTH_SECRET`, `CORS_ORIGINS`, `NODE_ENV=production` |

`apps/web/vercel.json` menulis semula `/api/*` ke projek API.

## Migrasi repo asal

`anwarhakim31/School-Management` = rujukan UI/workflow sahaja (Phase 0 audit belum dijalankan,
lihat blueprint §34/§46). Tiada kod Express/Mongo dibawa masuk.
