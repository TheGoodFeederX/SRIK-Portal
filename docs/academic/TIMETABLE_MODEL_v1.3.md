# Model Jadual Waktu — v1.3

**Sumber:** `SRIK_PORTAL_IMPLEMENTATION_SPEC_v1.3_TIMETABLE.md`
**Depends on:** v1.2 Academic Foundation (subjects, teaching assignments, enrollments)

---

## 1. Model domain

```text
Academic Year
   ↓
timetable_periods          (waktu persekolahan, per tahun)
   ↓
timetable_entries          (kelas × hari × waktu)
   ↓
teaching_assignments       (guru × kelas × subjek × tahun) — wajib untuk LESSON
```

Hari persekolahan: `SUNDAY`…`THURSDAY` (enum, bukan teks bebas).

## 2. `timetable_periods`

| Lajur | Nota |
|---|---|
| `academic_year_id` | FK, cascade |
| `period_no` | > 0, `UNIQUE(academic_year_id, period_no)` |
| `label` | paparan ("Waktu 1", "Rehat") |
| `start_time` / `end_time` | `start < end` disemak server + service |
| `type` | `LESSON`, `BREAK`, `ASSEMBLY`, `PRAYER`, `ACTIVITY`, `OTHER` |
| `is_active` | nyahaktif berbanding padam |
| `sort_order` | `UNIQUE(academic_year_id, sort_order)` |

Hanya `LESSON` memerlukan agihan pengajaran (§8).

## 3. `timetable_entries`

| Lajur | Nota |
|---|---|
| `academic_year_id`, `class_id`, `period_id` | FK; entri yatim tidak mungkin |
| `day_of_week` | enum `school_day` |
| `teaching_assignment_id` | wajib untuk `LESSON`, null untuk blok bukan pelajaran |
| `teacher_id`, `subject_id` | denormalisasi untuk query; **diambil** daripada agihan, bukan input klien |
| `entry_type` | jenis blok |
| `label` | untuk blok bukan pelajaran |
| `room` | pilihan; konflik bilik dikuatkuasakan bila diisi |
| `notes` | pilihan |

### 3.1 Constraint konflik (DB = benteng akhir, §44)

```sql
UNIQUE (academic_year_id, class_id, day_of_week, period_id)
UNIQUE (academic_year_id, teacher_id, day_of_week, period_id) WHERE teacher_id IS NOT NULL
UNIQUE (academic_year_id, room, day_of_week, period_id)       WHERE room IS NOT NULL AND room <> ''
```

Pelanggaran unik dipetakan kepada kod 409 khusus (`mapUniqueViolationToConflict`).

## 4. Peraturan pengesahan (§13)

```text
1. tahun akademik wujud dan tidak CLOSED
2. waktu milik tahun tersebut
3. kelas milik tahun tersebut dan tidak ARCHIVED
4. LESSON → agihan wajib, milik tahun + kelas yang sama
5. subjek agihan aktif
6. guru agihan aktif
7. konflik kelas → guru → bilik
```

## 5. Kod ralat stabil (§19)

```text
TIMETABLE_ENTRY_NOT_FOUND      TIMETABLE_PERIOD_NOT_FOUND
TIMETABLE_PERIOD_EXISTS        TIMETABLE_PERIOD_IN_USE
TIMETABLE_CLASS_CONFLICT       TIMETABLE_TEACHER_CONFLICT
TIMETABLE_ROOM_CONFLICT        TIMETABLE_INVALID_ASSIGNMENT
TIMETABLE_YEAR_CLOSED          TIMETABLE_PERIOD_YEAR_MISMATCH
TIMETABLE_CLASS_YEAR_MISMATCH  ASSIGNMENT_IN_USE
CLASS_SCOPE_DENIED
```

Respons konflik menyertakan `details.existingEntryId` supaya UI boleh menunjuk entri yang menghalang.

## 6. API

```text
GET    /api/v1/timetable/periods?academicYearId=      timetable.read
POST   /api/v1/timetable/periods                      timetable.manage
PATCH  /api/v1/timetable/periods/:id                  timetable.manage
DELETE /api/v1/timetable/periods/:id                  timetable.manage  (hanya jika tidak digunakan)

GET    /api/v1/timetable/entries?<filters>            timetable.read
POST   /api/v1/timetable/entries                      timetable.manage
PATCH  /api/v1/timetable/entries/:id                  timetable.manage
DELETE /api/v1/timetable/entries/:id                  timetable.manage

GET    /api/v1/timetable/classes/:classId             timetable.read  (scope guru)
GET    /api/v1/timetable/teachers/:teacherId          timetable.read  (guru: diri sendiri)
GET    /api/v1/timetable/me                           timetable.read
GET    /api/v1/timetable/assignment-options?classId=  timetable.read
GET    /api/v1/timetable/summary                      timetable.read
```

Bentuk bacaan (matriks):

```json
{ "data": { "academicYearId": "...", "days": ["SUNDAY", "..."], "periods": [], "entries": [] } }
```

## 7. Skop guru (§21)

```text
GET /timetable/me                    200  (jadual sendiri)
GET /timetable/teachers/{lain}       403
GET /timetable/classes/{dalam skop}  200
GET /timetable/classes/{luar skop}   403
POST/PATCH/DELETE                    403  (perlu timetable.manage)
```

Semua laluan menggunakan `apps/web/src/server/auth/scope.ts`.

## 8. Guard pemadaman agihan (§38)

```text
DELETE /api/v1/teaching-assignments/:id
  → 409 ASSIGNMENT_IN_USE jika ada timetable_entries yang merujuk
```

FK `ON DELETE restrict` menjadi jaring keselamatan kedua.

## 9. UI

```text
/app/academic/timetable            matriks kelas, dialog entri, pengurus waktu, cetak
/app/academic/timetable/me         Jadual Saya (guru)
```

Grid: baris = waktu, lajur = Ahad–Khamis. Sel pelajaran = subjek + guru (+ bilik); sel bukan
pelajaran = label/jenis. Cetakan A4 landskap melalui `@media print` dalam `styles.css`
(chrome aplikasi disembunyikan, jadual hitam-putih).

## 10. Audit

```text
timetable.period.create | .update | .delete
timetable.entry.create  | .update | .delete
```

`before`/`after` disimpan; tiada rahsia.

## 11. Migrasi

```text
0004_drop_old_timetable_entries   jadual lama (0 baris) dibuang; timetable_periods dicipta
0005_timetable_entries_v13        timetable_entries baharu + FK + 3 indeks konflik
```

Jadual lama tiada `period_id`, tiada pautan agihan dan tiada guard guru/bilik, dan kosong dalam
semua persekitaran — jadi penggantian adalah selamat. Data sedia ada (kelas, subjek, agihan)
tidak disentuh.

## 12. Bukan skop v1.3

```text
penjana jadual automatik/penyelesai
guru ganti & cuti
jadual peperiksaan
portal jadual waris/murid
penempahan bilik penuh
segerak kalendar
```
