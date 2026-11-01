# Model Peperiksaan — v1.4

**Sumber:** `SRIK_PORTAL_IMPLEMENTATION_SPEC_v1.4_EXAMINATION.md`
**Depends on:** v1.1 Managed Neon Auth + v1.2 Academic Foundation + v1.3 Timetable

---

## 1. Aliran kerja

```text
DRAFT ──▶ REVIEW ──▶ APPROVED ──▶ PUBLISHED (terminal)
  ▲          │            │
  └──────────┘            │
             ◀────────────┘
```

| Peralihan | Syarat | Permission | Audit |
|---|---|---|---|
| `DRAFT → REVIEW` | ≥1 subjek; semua murid layak ada markah | `exam.marks.review` | `exam.submit_review` |
| `REVIEW → DRAFT` | — | `exam.marks.review` | `exam.return_draft` |
| `REVIEW → APPROVED` | kelengkapan masih sah | `exam.marks.approve` | `exam.approve` |
| `APPROVED → REVIEW` | — | `exam.marks.approve` | `exam.return_review` |
| `APPROVED → PUBLISHED` | — | `exam.publish` | `exam.publish` |

`PUBLISHED` menolak semua perubahan: markah, subjek, `max_score`, konfigurasi kelas/subjek
(`EXAM_PUBLISHED_IMMUTABLE`).

---

## 2. Model data

### 2.1 `exams`

| Lajur | Nota |
|---|---|
| `academic_year_id` | FK; tahun `CLOSED` = baca-sahaja |
| `name`, `term`, `exam_type` | metadata |
| `status` | `DRAFT`/`REVIEW`/`APPROVED`/`PUBLISHED` |
| `is_active` | baharu (v1.4) |
| `created_by`, `created_at`, `updated_at` | jejak audit |

Metadata hanya boleh diubah dalam `DRAFT`.

### 2.2 `exam_subjects`

```text
exam + class + subject, max_score > 0, pass_score (nullable)
UNIQUE(exam_id, class_id, subject_id)
```

Penciptaan disekat jika tiada `teaching_assignment` yang sepadan (`EXAM_ASSIGNMENT_MISSING`) —
mengelakkan konfigurasi markah tanpa guru.

### 2.3 `exam_marks`

```text
UNIQUE(exam_subject_id, student_id)
score NULL = belum diisi (sifar ialah markah sah)
entered_by / entered_at / updated_at
```

---

## 3. Peraturan markah

| Peraturan | Penguatkuasaan |
|---|---|
| `0 ≤ mark ≤ max_score` | `validateMarkRows()` + Zod (400 `EXAM_MARK_OUT_OF_RANGE`) |
| Kosong = `NULL`, bukan `0` | `saveMarks()` |
| Murid mesti dari enrollment `ACTIVE` kelas tersebut | `EXAM_STUDENT_NOT_ELIGIBLE` |
| Tiada pendua dalam satu batch | `EXAM_MARK_DUPLICATE` |
| Batch tidak sah → **tiada** simpan separa | transaksi |
| Gred terbitan, bukan sumber | `grade` nullable; tiada band dikodkan |

---

## 4. Skop dan kebenaran

| Peranan | permission |
|---|---|
| ADMIN | `exam.read`, `exam.manage`, `exam.marks.write`, `exam.marks.review`, `exam.marks.approve`, `exam.publish` |
| TEACHER | `exam.read`, `exam.marks.write` (hanya agihan sendiri, hanya `DRAFT`) |

Tulis markah memerlukan `teaching_assignment` untuk (tahun, guru, kelas, subjek).
Guru yang tidak mempunyai agihan → `403 EXAM_ASSIGNMENT_MISSING`.
Senarai peperiksaan guru ditapis mengikut agihan (`visibleExamIds`).

---

## 5. API

```text
GET    /api/v1/exams?academicYearId=&status=          exam.read
GET    /api/v1/exams/:id                              exam.read
POST   /api/v1/exams                                  exam.manage
PATCH  /api/v1/exams/:id                              exam.manage

GET    /api/v1/exams/:id/subjects                     exam.read
POST   /api/v1/exams/:id/subjects                     exam.manage
PATCH  /api/v1/exam-subjects/:id                      exam.manage
DELETE /api/v1/exam-subjects/:id                      exam.manage  (DRAFT & belum ada markah)

GET    /api/v1/exam-subjects/:id/marks                exam.read
PUT    /api/v1/exam-subjects/:id/marks                exam.marks.write  (bulk upsert)

POST   /api/v1/exams/:id/submit-review                exam.marks.review
POST   /api/v1/exams/:id/return-draft                 exam.marks.review
POST   /api/v1/exams/:id/approve                      exam.marks.approve
POST   /api/v1/exams/:id/return-review                exam.marks.approve
POST   /api/v1/exams/:id/publish                      exam.publish

GET    /api/v1/exams/:id/completeness                 exam.read
GET    /api/v1/exams/:id/summary                      exam.read
GET    /api/v1/exams/:examId/students/:studentId/results   exam.read
```

Tiada `PATCH /exams/:id { status }`: status hanya berubah melalui endpoint peralihan.

---

## 6. Kelengkapan

```json
{
  "subjects": 2,
  "eligibleStudents": 31,
  "enteredMarks": 60,
  "missingMarks": 2,
  "completionPercentage": 97,
  "ready": false,
  "perSubject": [{ "examSubjectId": "…", "eligible": 31, "entered": 30, "missing": 1 }]
}
```

`ready` mesti `true` sebelum `DRAFT → REVIEW` dan `REVIEW → APPROVED`.

---

## 7. UI

```text
/app/academic/exams                        senarai + cipta (ADMIN)
/app/academic/exams/:id                    butiran, subjek, kelengkapan, aliran kerja
/app/academic/exams/:id/marks/:examSubjectId   isi markah (bulk save)
```

- Grid markah: Bil., No. Murid, Nama, Markah, Gred; input di luar julat disorot.
- Panel aliran kerja memaparkan tindakan mengikut status + permission.
- Penerbitan memerlukan pengesahan eksplisit dengan amaran ketidakbolehubahan.
- Lencana status BM: Draf / Semakan / Diluluskan / Diterbitkan.

---

## 8. Audit

```text
exam.create | exam.update
exam.subject.create | .update | .delete
exam.marks.save            (satu peristiwa bulk: rowCount, changedCount)
exam.submit_review | exam.return_draft | exam.approve | exam.return_review | exam.publish
```

Tiada rahsia atau token dalam payload.

---

## 9. Migrasi

```text
0006_exams_v14.sql   additif:
  exams.is_active, exams.updated_at
  exam_subjects.pass_score, created_at, updated_at
  exam_marks.entered_at
  UNIQUE(exam_subjects: exam_id, class_id, subject_id)
  index: exams(year), exams(status), exam_subjects(exam/class/subject), exam_marks(student)
```

Data sedia ada (tiada baris peperiksaan di production) tidak terjejas.

---

## 10. Keserasian v1.5 Report Card

v1.5 hanya perlu membaca:

```text
exams (status = PUBLISHED) → exam_subjects → exam_marks → students/enrollments
```

`GET /exams/:examId/students/:studentId/results` sudah memulangkan bentuk yang diperlukan
(subjek, markah, gred, kelas, markah penuh).

---

## 11. Bukan skop v1.4

```text
ranking / top student / GPA      (dilarang secara eksplisit §78)
layout report card akhir
portal waris / murid
PBD
jadual peperiksaan
sijil
integrasi peperiksaan luar
notifikasi e-mel/SMS
```
