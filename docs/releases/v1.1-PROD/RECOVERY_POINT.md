# RECOVERY_POINT — v1.1-PROD

> **Status:** TEMPLAT — belum diisi. Diisi semasa PROD-2 sebelum sebarang perubahan production.
> Jangan simpan sebarang kredensial dalam dokumen ini.

---

## Semasa (production pra-cutover)

| Item | Nilai | Cara semak |
|---|---|---|
| Tarikh/masa | — | — |
| Git `main` SHA | — | `git rev-parse main` |
| Vercel deployment ID | — | `vercel ls` / dashboard |
| Vercel deployment URL | `https://srik-portal.vercel.app` | smoke `GET /api/v1/health` |
| Neon branch | `br-mute-sun-b3t283ay` (`main`) | `GET /api/v2/projects/{p}/branches` |
| Neon endpoint | `ep-dry-sunset-b3scjaeb` (pooled) | console |
| Migration journal | `0000_broad_moon_knight` | `packages/db/migrations/meta/_journal.json` |
| Snapshot/restore point ID | — | Neon console → Restore |
| `pg_dump` (pilihan) | — | direct/unpooled connection |
| Operator | — | — |

---

## Isi semula selepas Stage B

| Item | Nilai |
|---|---|
| Tarikh/masa | — |
| Git SHA | — |
| Vercel deployment ID | — |
| Migration journal | — |
| Snapshot ID | — |
| Operator | — |

---

## Prosedur pulih (ringkas)

```text
1. Neon Console → Branch → Restore → pilih timestamp/restore point
   (alternatif: buat branch baharu dari restore point, uji, kemudian tukar DATABASE_URL)
2. Vercel → Promotions → pilih deployment yang direkod di atas
3. Sahkan GET /api/v1/health → 200 dan POST /api/v1/auth/login (legacy, jika pra-cutover)
```

Rujukan: `docs/releases/v1.1-PROD/RESTORE_DRILL.md`.
