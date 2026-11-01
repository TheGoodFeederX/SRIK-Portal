# BACKUP_POLICY — SRIK Portal

**Sumber keperluan:** `SRIK_PORTAL_IMPLEMENTATION_SPEC_v1.1-PROD-R2.md` §17–§19
**Status:** automasi aktif (GitHub Actions `Backup`), latihan pemulihan pertama selesai.

---

## 1. Dasar

| Item | Nilai |
|---|---|
| Kaedah | `pg_dump --format=custom` melalui sambungan **direct/unpooled** |
| Jadual | harian 02:15 MYT (`cron: 15 18 * * *` UTC) |
| Simpanan | artifact GitHub Actions, 30 hari |
| Integriti | `sha256` disimpan bersama setiap dump |
| Retensi sasaran | daily 7 / weekly 4 / monthly 6 (artifact 30 hari meliputi daily+weekly) |
| Skrip | `scripts/backup.sh`, `scripts/restore-verify.sh` |
| Secret | `DATABASE_URL_UNPOOLED` (repository secret) |

Branch Neon `rollback-pre-v1.1-prod` ialah recovery point cutover, **bukan** polisi backup.

---

## 2. Menjalankan backup manual

```bash
DATABASE_URL_UNPOOLED='<direct connection>' bash scripts/backup.sh backups
```

Output: `srik-<UTC>.dump`, `.sha256`, `.json`.

## 3. Latihan pemulihan

```bash
# 1. branch Neon bukan-production (contoh: drill-restore-YYYYMMDD) + endpoint
# 2. pulihkan + sahkan
TARGET_URL='<branch connection>' bash scripts/restore-verify.sh backups/srik-*.dump
# 3. padam branch latihan
```

`restore-verify.sh` menyemak: jadual teras, artifak legacy (pra/post Stage B), integriti
`profiles` ↔ `auth_user_id`, kiraan ADMIN, dan drift `student_guardians`.

---

## 4. Rekod latihan

| Tarikh | Dump | Branch latihan | Keputusan | Nota |
|---|---|---|---|---|
| 2026-11-01 | `srik-20261101T023649Z.dump` (72 KB, sha256 `33c4316c6d14…`) | `drill-restore-20261101` (`br-dark-morning-b310uhc4`) | **PASS** | 20 jadual dipulihkan; `profiles=1`, `linked=1`, `admins=1`, drift=0; artifak legacy masih hadir (pra-Stage B) |

---

## 5. Retensi lanjutan (belum automatik)

Artifact 30 hari tidak memenuhi monthly 6. Sebelum data sekolah sebenar kritikal:

```text
- simpan bulanan ke storan berasingan (S3/R2) atau branch Neon berlabel bulanan
- jalankan restore drill berjadual (suku tahun)
- rekod setiap drill dalam jadual §4
```
