# STAGE_B_APPROVAL — v1.1-PROD

> **BLOK:** Dokumen ini mesti ditandatangani sebelum sebarang SQL destruktif dijalankan.
> Tanpa kelulusan → **JANGAN JALANKAN STAGE B** (§75).

---

## 1. Kenyataan kelulusan (wajib)

```text
Production has been stable under Managed Neon Auth.
Rollback to the legacy auth schema is no longer required.
Destructive legacy cleanup is approved.
```

| Item | Nilai |
|---|---|
| Nama pemilik | — |
| Tarikh | — |
| Rujukan kelulusan (mesej/catatan) | — |
| Recovery point Stage B (ID) | — |
| Git SHA pada masa kelulusan | — |

---

## 2. Skop Stage B

```sql
DELETE FROM public.sessions;
DROP TABLE public.sessions;
ALTER TABLE public.profiles DROP COLUMN password_hash;
```

Plus pembersihan kod/dokumen (§59, §60):

```text
srik_session              → tiada padanan dibenarkan
password_hash             → tiada padanan dibenarkan
public.sessions           → tiada padanan dibenarkan
verifyPassword / hashToken → tiada
SEED_ADMIN_PASSWORD       → tiada
AUTH_SECRET               → tiada
```

---

## 3. Pemeriksaan pra-Stage B (§55)

| # | Item | Status | Bukti |
|---|---|---|---|
| 1 | Cutover diterima | ☐ | `CUTOVER_LOG.md` |
| 2 | Admin akses stabil | ☐ | `STABILIZATION.md` |
| 3 | Onboarding guru disahkan | ☐ | `SMOKE_TEST.md` §4 |
| 4 | Reset kata laluan disahkan | ☐ | `SMOKE_TEST.md` §7 |
| 5 | Tiada rollback diperlukan | ☐ | `STABILIZATION.md` |
| 6 | Record scope regresi hijau | ☐ | `SMOKE_TEST.md` §5 |
| 7 | Backup/recovery tersedia | ☐ | `RECOVERY_POINT.md` |
| 8 | Kelulusan pemilik | ☐ | §1 di atas |

**Lapan-lapan mesti ✅ sebelum migration B.**

---

## 4. Implikasi selepas Stage B (§65)

```text
Rollback = restore database ATAU forward-fix.
Redeploy aplikasi lama tidak lagi memulihkan auth legacy.
```

---

## 5. Migrasi yang akan dijana

```text
packages/db/migrations/0002_remove_legacy_auth.sql
```

Dijana dengan `pnpm db:generate` **selepas** `sessions` dan `password_hash` dibuang daripada
`packages/db/src/schema.ts`, semak SQL secara manual, jalankan pada branch Neon ujian dahulu,
kemudian production menggunakan sambungan **direct/unpooled**.
