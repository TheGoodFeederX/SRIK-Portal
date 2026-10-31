# RESTORE DRILL — v1.1-PROD

> Latihan pemulihan (§14). Dijalankan pada branch Neon **bukan production**.

---

## Prosedur

```text
1. Neon Console → project srik-portal → Restore
2. Pilih restore point / timestamp yang direkod dalam RECOVERY_POINT.md
3. Pulihkan ke branch BAHARU (contoh: drill-restore-YYYYMMDD)
4. Sambung DATABASE_URL ke branch tersebut
5. Jalankan semakan di bawah
6. Padam branch latihan selepas rekod
```

---

## Semakan

| # | Item | Jangkaan | Status |
|---|---|---|---|
| 1 | Skema | `profiles`, `user_roles`, `staff`, `students`, `classes`, `student_attendance` wujud | ☐ |
| 2 | Migration journal | sepadan dengan `RECOVERY_POINT.md` | ☐ |
| 3 | Profil admin | `profiles.auth_user_id NOT NULL`, `status=ACTIVE` | ☐ |
| 4 | Role admin | `user_roles` mengandungi `ADMIN` | ☐ |
| 5 | Baseline staf/murid | kiraan sepadan dengan pra-pemulihan | ☐ |
| 6 | Aplikasi | `GET /api/v1/health` → 200, `GET /api/v1/auth/session` → 200 | ☐ |
| 7 | Log masuk | berjaya dengan identiti Managed Auth branch tersebut | ☐ |

---

## Rekod latihan

| Tarikh | Operator | Restore point | Branch latihan | Keputusan | Nota |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
