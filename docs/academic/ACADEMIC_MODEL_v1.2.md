# Model Akademik — v1.2 Academic Foundation

**Sumber:** `SRIK_PORTAL_IMPLEMENTATION_SPEC_v1.2_ACADEMIC_FOUNDATION.md`
**Status:** dilaksanakan; production cutover melalui PR v1.2.

---

## 1. Rantaian kebergantungan

```text
Academic Year
   ↓
Class  ──────────────┐
   ↓                 │
Enrollment           │  (keahlian murid↔kelas — sumber kebenaran)
   ↓                 │
Subject              │
   ↓                 │
Teaching Assignment ─┘  (guru × kelas × subjek × tahun)
   ↓
Timetable (v1.3) → Examination → Report Card
```

## 2. Entiti

| Entiti | Peranan | Constraint |
|---|---|---|
| `academic_years` | tahun persekolahan | partial unique: satu `is_current` aktif |
| `classes` | kelas dalam tahun | `UNIQUE(academic_year_id, name)`; `class_teacher_id` = guru kelas |
| `subjects` | master data stabil | `code` UNIQUE (uppercase); lifecycle = `is_active` |
| `teaching_assignments` | guru × kelas × subjek × tahun | `UNIQUE(academic_year_id, teacher_id, class_id, subject_id)` |
| `enrollments` | keahlian murid↔kelas | `UNIQUE(student_id, academic_year_id)`; `status` enum |

### 2.1 `enrollment_status`

```text
ACTIVE      murid aktif dalam kelas
TRANSFERRED pindah keluar
WITHDRAWN   berhenti
COMPLETED   tamat tahun
```

### 2.2 Maksud `teaching_assignments.is_primary`

Guru utama untuk **subjek dalam kelas itu**. **Bukan** guru kelas — guru kelas kekal pada
`classes.class_teacher_id` (spec §19).

## 3. Peraturan perniagaan

| Peraturan | Di mana dikuatkuasakan |
|---|---|
| Tahun `CLOSED` tidak boleh diubah | `assertYearMutable()` (409 `ACADEMIC_YEAR_CLOSED`) |
| Kelas mesti dalam tahun yang dipilih | `assertClassInYear()` (409 `INVALID_CLASS`) |
| Subjek mesti aktif untuk agihan baharu | `assertActiveSubject()` (409 `SUBJECT_INACTIVE`) |
| Guru mesti wujud & aktif | `assertActiveTeacher()` (409 `INVALID_TEACHER`) |
| Agihan tidak boleh bertindih | `assertAssignmentUnique()` + unique index (409 `ASSIGNMENT_EXISTS`) |
| Satu pendaftaran per murid per tahun | `findEnrollment()` + unique index (409 `ENROLLMENT_EXISTS`) |
| Pindah kelas dalam tahun sama = kemas kini baris yang sama | `PATCH /enrollments/:id/class` + audit `enrollment.class_change` |
| Subjek yang sudah digunakan = nyahaktif, bukan padam | `PATCH /subjects/:id { isActive:false }` |
| Agihan hanya boleh dipadam jika belum dirujuk | `DELETE /teaching-assignments/:id` (v1.3 akan menambah semakan rujukan) |

## 4. Record scope guru (satu sumber)

```text
apps/web/src/server/auth/scope.ts

getTeacherClassIds()    kelas seliaan (class_teacher_id) ∪ kelas diajar (teaching_assignments)
getTeacherStudentIds()  murid dengan enrollment ACTIVE dalam kelas tersebut
canAccessClass() / canAccessStudent()
currentStaffId() / classMemberIds()
```

Semua laluan (students, attendance, enrollments, assignments) menggunakan modul ini.
Tiada SQL scope bertaburan di route.

## 5. API

```text
GET    /api/v1/academic-years            academic.year.read
POST   /api/v1/academic-years            academic.year.manage
PATCH  /api/v1/academic-years/:id        academic.year.manage

GET    /api/v1/classes                   academic.class.read   (guru: scope sahaja)
POST   /api/v1/classes                   academic.class.manage
PATCH  /api/v1/classes/:id               academic.class.manage
GET    /api/v1/classes/:id/students      student.read          (guru: scope sahaja)

GET    /api/v1/subjects                  academic.subject.read
POST   /api/v1/subjects                  academic.subject.manage
PATCH  /api/v1/subjects/:id              academic.subject.manage

GET    /api/v1/teaching-assignments      academic.assignment.read (guru: milik sendiri)
POST   /api/v1/teaching-assignments      academic.assignment.manage
PATCH  /api/v1/teaching-assignments/:id  academic.assignment.manage
DELETE /api/v1/teaching-assignments/:id  academic.assignment.manage

GET    /api/v1/enrollments               student.read           (guru: scope sahaja)
POST   /api/v1/enrollments               academic.class.manage
POST   /api/v1/enrollments/bulk          academic.class.manage  (transaksi semua-atau-tiada)
PATCH  /api/v1/enrollments/:id/class     academic.class.manage
POST   /api/v1/enrollments/:id/end       academic.class.manage

GET    /api/v1/academic/summary          academic.year.read
```

## 6. Audit

```text
subject.create | subject.update | subject.deactivate
teaching_assignment.create | .update | .delete
class.create | class.update
academic_year.create | academic_year.update
enrollment.create | enrollment.class_change | enrollment.end
```

`before_json` / `after_json` disimpan; tiada rahsia.

## 7. Had v1.2 (sengaja tidak dibuat)

```text
- editor jadual waktu & enjin pertindihan (v1.3)
- aliran peperiksaan, markah, report card (v1.4+)
- import Excel (domain service boleh diguna semula)
- sejarah pindah kelas merentas baris (satu baris per tahun, §17)
```
