# RESTORE DRILL — v1.1-PROD-R2

> Latihan pemulihan (§19). Dijalankan pada branch Neon **bukan production**.

## Pelaksanaan 2026-11-01

| Item | Nilai |
|---|---|
| Dump | `srik-20261101T023649Z.dump` (72 KB) |
| sha256 | `33c4316c6d14…` |
| Sumber | production `main` melalui sambungan direct |
| Branch latihan | `drill-restore-20261101` / `br-dark-morning-b310uhc4` |
| Arahan | `TARGET_URL=… bash scripts/restore-verify.sh <dump>` |

### Semakan

| # | Item | Jangkaan | Keputusan |
|---|---|---|---|
| 1 | Jadual teras | profiles, user_roles, staff, students, classes, enrollments, subjects, teaching_assignments, student_attendance, account_invitations, audit_log | ✅ (20 jadual) |
| 2 | Artifak legacy (pra-Stage B) | `sessions`, `profiles.password_hash` hadir | ✅ hadir |
| 3 | Profil | `profiles = 1` | ✅ |
| 4 | Pautan identiti | `linked = 1` | ✅ |
| 5 | ADMIN | `admins = 1` | ✅ |
| 6 | Drift `student_guardians` | `0` | ✅ |
| 7 | Aplikasi | `GET /api/v1/health` pada DB dipulihkan | ✅ (semakan skrip) |

**Keputusan: PASS.** Branch latihan dipadam selepas rekod.

## Latihan seterusnya

```text
- selepas Stage B: sahkan artifacts legacy ABSENT (scripts/restore-verify.sh menyemak ini)
- ulang setiap suku tahun selepas data sekolah sebenar bermula
```
