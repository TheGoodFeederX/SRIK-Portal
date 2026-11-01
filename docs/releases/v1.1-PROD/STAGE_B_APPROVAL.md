# STAGE_B_APPROVAL — v1.1-PROD

> **BLOK:** Dokumen ini mesti ditandatangani sebelum sebarang SQL destruktif dijalankan.
> Tanpa kelulusan → **JANGAN JALANKAN STAGE B** (§75).

---

## 1. Kenyataan kelulusan

```text
Production has been stable under Managed Neon Auth.
Rollback to the legacy auth schema is no longer required.
Destructive legacy cleanup is approved.
```

| Item | Nilai |
|---|---|
| Nama pemilik | TheGoodFeederX (melalui sesi Harness) |
| Tarikh | 2026-11-01 |
| Rujukan kelulusan | jawapan pemilik: "Ya — laksana Stage B (R8)" |
| Recovery point Stage B | Neon branch `rollback-pre-stage-b-20261101` |
| Git SHA pada masa kelulusan | direkod dalam `RECOVERY_POINT.md` |

---

## 2. Skop Stage B

```sql
DELETE FROM public.sessions;
DROP TABLE public.sessions;
ALTER TABLE public.profiles DROP COLUMN password_hash;
```

Pembersihan kod/dokumen (§59, §60): tiada padanan `srik_session`, `password_hash`,
`public.sessions`, `verifyPassword`, `hashToken`, `AUTH_SECRET`, `SEED_ADMIN_PASSWORD`
kecuali rujukan sejarah yang dilabel.

---

## 3. Pemeriksaan pra-Stage B (§16, §55)

| # | Item | Status | Bukti |
|---|---|---|---|
| 1 | Cutover diterima | ✅ | `CUTOVER_LOG.md`, 38/38 smoke |
| 2 | Admin login stabil | ✅ | production smoke |
| 3 | Teacher login stabil | ✅ | onboarding guru diuji |
| 4 | Admin reset kata laluan | ✅ | `POST /users/:id/reset-password` diuji |
| 5 | Paksa tukar kata laluan | ✅ | `PASSWORD_CHANGE_REQUIRED` + `/tukar-kata-laluan` |
| 6 | Provisioning | ✅ | `POST /users/provision` (tanpa emel) |
| 7 | Tiada 5xx berulang | ✅ | health 200 sepanjang cutover |
| 8 | Record scope guru betul | ✅ | ujian integration + production |
| 9 | Pengurusan pengguna stabil | ✅ | UI + API |
| 10 | Recovery point tersedia | ✅ | branch + dump + restore drill |
| 11 | Backup automatik | ✅ | `.github/workflows/backup.yml` + secret |
| 12 | Restore drill | ✅ | `docs/releases/BACKUP_POLICY.md` §4 (PASS) |

**Keputusan: 12/12 ✅ — Stage B boleh dijalankan.**
