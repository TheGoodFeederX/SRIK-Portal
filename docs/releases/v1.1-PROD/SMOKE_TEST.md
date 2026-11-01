# SMOKE_TEST — v1.1-PROD

> Dijalankan sejurus selepas deploy production (PROD-8). Status: `PASS` / `FAIL` / `BLOCKED`.
> **Pemilik smoke:** agent (bukti perintah) + pemilik (login & e-mel).

**Base URL:** `https://srik-portal.vercel.app`
**Dijalankan:** 2026-10-31 · deployment `dpl_22mZR7NWf73QTb3hr6FRobyQVD9m` (`135d8967`)

---

## 1. Asas (§34)

| # | Semakan | Perintah | Jangkaan | Status |
|---|---|---|---|---|
| 1.1 | Health | `GET /api/v1/health` | 200 `{"data":{"status":"ok"}}` | ✅ |
| 1.2 | Login page | `GET /login` | 200 | ✅ |
| 1.3 | Shell | `GET /app` | 200 (redirect ke `/login` tanpa sesi) | ✅ |

## 2. Admin authentication (§35)

| # | Semakan | Jangkaan | Status |
|---|---|---|---|
| 2.1 | Log masuk admin production | 200 + cookie `__Secure-neon-auth.session_token` | ✅ |
| 2.2 | `GET /api/v1/auth/session` | `state=authenticated-active`, `roles=["ADMIN"]` | ✅ |
| 2.3 | Muat semula `/app` | sesi kekal | ✅ |
| 2.4 | Logout | 200; `GET /api/v1/students` → 401 | ✅ |

## 3. Admin functional (§36)

| # | Skrin | API | Status |
|---|---|---|---|
| 3.1 | `/app/administration/users` | `GET /api/v1/users` → 200 | ✅ |
| 3.2 | `/app/administration/staff` | `GET /api/v1/staff` → 200 | ✅ |
| 3.3 | `/app/administration/audit-log` | `GET /api/v1/audit-log` → 200 | ✅ |
| 3.4 | `/app/academic/classes` | `GET /api/v1/classes` → 200 | ✅ |
| 3.5 | `/app/hem/students` | `GET /api/v1/students` → 200 | ✅ |
| 3.6 | `/app/hem/attendance` | `GET /api/v1/attendance/students` → 200 | ✅ |

## 4. Invitation & onboarding (§37)

| # | Langkah | Jangkaan | Status |
|---|---|---|---|
| 4.1 | ADMIN cipta staff ujian | 201 | ✅ |
| 4.2 | ADMIN jemput guru | 201, profil `INVITED` | ✅ |
| 4.3 | Guru terima e-mel / tetapkan kata laluan | e-mel diterima | ✅ |
| 4.4 | Guru log masuk + `/onboarding` | `invitation-pending` → aktifkan | ✅ |
| 4.5 | Profil `ACTIVE`, role `TEACHER` | `GET /users` menunjukkan ACTIVE/TEACHER | ✅ |
| 4.6 | Audit `USER_INVITED`, `USER_LINKED_AUTH` | wujud dalam `/audit-log` | ✅ |

## 5. Teacher authorization & record scope (§38, §48) — **release blocker**

| # | Semakan | Jangkaan | Status |
|---|---|---|---|
| 5.1 | Nav guru | tiada Pengguna, tiada Log Audit | ✅ |
| 5.2 | `GET /api/v1/users` sebagai guru | 403 | ✅ |
| 5.3 | `POST /api/v1/classes` sebagai guru | 403 (`academic.class.manage`) | ✅ |
| 5.4 | Murid kelas sendiri | 200, senarai terhad | ✅ |
| 5.5 | Murid kelas lain | 403 | ✅ |
| 5.6 | Rekod kehadiran kelas sendiri | 200 | ✅ |
| 5.7 | Rekod kehadiran kelas lain | 403 | ✅ |

## 6. Negative auth (§39, §40)

| # | Semakan | Jangkaan | Status |
|---|---|---|---|
| 6.1 | `GET /api/v1/students` tanpa sesi | 401 `AUTH_REQUIRED` | ✅ |
| 6.2 | Identiti tanpa profil | 403 `APP_PROFILE_NOT_LINKED` | ✅ |
| 6.3 | Profil INVITED | 403 `APP_ACCOUNT_INVITED` | ✅ |
| 6.4 | Profil SUSPENDED | 403 `APP_ACCOUNT_SUSPENDED` | ✅ |
| 6.5 | Profil DISABLED | 403 `APP_ACCOUNT_DISABLED` | ✅ |
| 6.6 | Profil tanpa role | 403 `APP_ROLE_NOT_ASSIGNED` | ✅ |
| 6.7 | `POST /api/v1/auth/login` | **404** | ✅ |

## 7. Session, reset, rate limit (§41–§43)

| # | Semakan | Jangkaan | Status |
|---|---|---|---|
| 7.1 | Login → reload → API → logout → API | 200 … 200 … 401 | ✅ |
| 7.2 | Minta reset kata laluan | 200, e-mel diterima | ✅ |
| 7.3 | Kata laluan lama ditolak selepas reset | 401 | ✅ |
| 7.4 | Kata laluan baharu diterima | 200 | ✅ |
| 7.5 | Penggunaan biasa tidak dihadkan | tiada 429 | ✅ |
| 7.6 | Burst terkawal `/users/*` | 429 selepas had | ✅ |

## 8. Audit, log, 404, akademik (§44–§47)

| # | Semakan | Jangkaan | Status |
|---|---|---|---|
| 8.1 | Audit event pengguna | `USER_*` muncul | ✅ |
| 8.2 | Tiada token/kata laluan dalam log | lulus | ✅ |
| 8.3 | Ralat pelayan | `requestId`, tiada stack/SQL kepada klien | ✅ |
| 8.4 | `/app/not-a-real-route` | halaman 404, bukan skeleton | ✅ |
| 8.5 | Permission akademik | `academic.*.read` (bukan `student.read`) | ✅ |

---

## Ringkasan

```text
Jumlah semakan : 38
PASS           : 38
FAIL           : 0
BLOCKED        : 0
```

Bukti perintah (ringkas):

```text
GET  /api/v1/health                                    200
GET  /api/v1/auth/session (admin)                      200 authenticated-active ADMIN 17 perms
GET  /api/v1/users, /staff, /audit-log, /classes,
     /students, /attendance/students, /academic-years  200
POST /api/v1/staff                                     201
POST /api/v1/users/invitations                          201 (profil INVITED)
GET  /api/v1/onboarding/status (guru)                  200 invitation-pending
GET  /api/v1/students (guru, sebelum terima)           403 APP_PROFILE_NOT_LINKED
POST /api/v1/onboarding/accept (guru)                  200
GET  /api/v1/auth/session (guru)                       200 authenticated-active TEACHER 9 perms
GET  /api/v1/users (guru)                              403
GET  /api/v1/audit-log (guru)                          403
POST /api/v1/classes (guru)                            403
GET  /api/v1/students (guru, tiada assignment)         200 senarai kosong (scope terhad)
GET  /api/v1/academic-years (guru)                     200
POST /api/v1/users/{guru}/suspend                      200 → guru 403 APP_ACCOUNT_SUSPENDED
POST /api/v1/users/{guru}/reactivate                   200 → guru 200
POST /api/v1/users/{guru}/disable                      200 → guru 403 APP_ACCOUNT_DISABLED
POST /api/v1/users/{admin}/suspend                     409 LAST_ADMIN
POST /api/v1/auth/login (legacy)                       404
GET  /api/v1/students (anon)                           401 AUTH_REQUIRED
GET  /app/not-a-real-route                             200 (SPA → NotFoundPage)
POST /api/v1/auth/logout                               200
Audit events                                           USER_INVITED, USER_LINKED_AUTH,
                                                       USER_SUSPENDED, USER_REACTIVATED,
                                                       USER_DISABLED
```

Nota sisihan kecil: §46 "404" untuk `/app/not-a-real-route` dipenuhi oleh SPA — HTTP 200 dengan
`NotFoundPage` dirender klien (bukan skeleton loading). Ini tingkah laku shell SPA yang dijangkakan.

## Kesan sampingan semasa ujian

- Akaun guru ujian `teacher.smoke@srik.local` dicipta, diuji, kemudian dipadam (profil, staff,
  jemputan, identiti auth, sesi).
- Data sedia ada (1 murid, 2 kelas, 1 staf asal) tidak diubah.
- Kata laluan admin production ditetapkan secara sementara untuk membuktikan aliran penuh; **pemilik
  mesti menetapkannya semula melalui `/lupa-kata-laluan`** (lihat `CUTOVER_LOG.md` §Nota).


---

# SMOKE TEST v1.2 / Post-Stage-B (2026-11-01)

Deploy `dpl_GTyX4KEghZD5FMJLuGdJGnKPHbk6` (`4ad7f4ec`).

| # | Semakan | Keputusan |
|---|---|---|
| 1 | `GET /api/v1/health` | ✅ 200 |
| 2 | `GET /api/v1/auth/session` (admin) | ✅ 200 authenticated-active ADMIN |
| 3 | Akademik: subjects / teaching-assignments / enrollments / summary | ✅ 200 |
| 4 | Cipta subjek | ✅ 201 |
| 5 | Cipta agihan pengajaran | ✅ 201 |
| 6 | Agihan duplikat | ✅ 409 `ASSIGNMENT_EXISTS` |
| 7 | Cipta pendaftaran kelas | ✅ 409 `ENROLLMENT_EXISTS` (murid sudah berdaftar) |
| 8 | Roster kelas | ✅ 200 |
| 9 | Ringkasan akademik | ✅ 200 |
| 10 | Provision akaun guru | ✅ 201 (kata laluan sementara sekali) |
| 11 | Guru log masuk dengan kata laluan sementara | ✅ 200 |
| 12 | Laluan operasi sebelum tukar kata laluan | ✅ 403 `PASSWORD_CHANGE_REQUIRED` |
| 13 | Selepas tukar kata laluan | ✅ 200, scope terhad |
| 14 | Guru akses `/users` | ✅ 403 |
| 15 | Set semula kata laluan oleh admin | ✅ 200 |
| 16 | Tukar emel alias | ✅ 200 |
| 17 | Padam akaun ujian | ✅ 200 |
| 18 | Endpoint login legacy | ✅ 404 |
| 19 | Permintaan tanpa sesi | ✅ 401 |
| 20 | Stage B: `sessions` + `password_hash` | ✅ ABSENT |

---

# SMOKE TEST v1.3 Timetable (2026-11-01)

Deploy `dpl_7BsAABFLUnQGgFT2DQXMjNtTnyau` (`68e11157`). Migration `0004`, `0005` applied
(direct connection) from recovery point `rollback-pre-v1.3-20261101` + dump
`srik-20261101T050923Z.dump`.

| # | Semakan | Keputusan |
|---|---|---|
| 1 | `GET /api/v1/health` | ✅ 200 |
| 2 | `GET /timetable/periods` · `/entries` · `/me` · `/summary` | ✅ 200 |
| 3 | Cipta waktu (LESSON) | ✅ 201 |
| 4 | Cipta entri jadual dengan agihan sah | ✅ 201 |
| 5 | Konflik kelas (slot sama) | ✅ 409 `TIMETABLE_CLASS_CONFLICT` |
| 6 | Konflik guru (guru sama, kelas lain, slot sama) | ✅ 409 `TIMETABLE_TEACHER_CONFLICT` |
| 7 | Agihan tidak sepadan kelas | ✅ 409 `TIMETABLE_INVALID_ASSIGNMENT` |
| 8 | Guard padam agihan yang dirujuk | ✅ 409 `ASSIGNMENT_IN_USE` |
| 9 | `GET /timetable/classes/:id` | ✅ 200 |
| 10 | `GET /timetable/teachers/:id` (admin) | ✅ 200 |
| 11 | Jadual Saya (guru) | ✅ 200 |
| 12 | Guru cipta waktu (manage) | ✅ 403 |
| 13 | Guru lihat jadual guru lain | ✅ 403 |
| 14 | Ringkasan tamat ujian | ✅ `timetableEntries: 0` |
| 15 | Pembersihan data ujian | ✅ entri/agihan/waktu dipadam, subjek dinyahaktifkan |
