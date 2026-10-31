# SRIK Portal — Architecture & Migration Blueprint v1.0

**Projek:** Portal Sekolah Rendah Islam Al-Khairiah (SRIK)  
**Versi:** 1.0  
**Tarikh:** 31 Oktober 2026  
**Status:** Blueprint untuk pelaksanaan  
**Asas UI/rujukan aliran:** `anwarhakim31/School-Management`  
**Spesifikasi portfolio rujukan:** `SRIK_UI_FOUR_PORTFOLIOS_HARNESS_SPEC_v1.0.md`  
**Sasaran pelaksana:** DeepSeek Harness / agent coding  
**Model sistem:** Single-school modular monolith  
**Bahasa utama UI:** Bahasa Melayu  
**Bahasa kedua:** English  
**Sasaran klien:** Desktop, tablet, telefon, PWA

---

## 1. Tujuan Blueprint

Blueprint ini menetapkan seni bina rasmi untuk membina semula Portal SRIK dengan menggunakan repository `anwarhakim31/School-Management` sebagai **rujukan UI dan aliran kerja**, bukan sebagai backend production yang dikekalkan tanpa perubahan.

Blueprint ini menjadi sumber keputusan teknikal untuk:

1. frontend baharu berasaskan Vite + React + TypeScript;
2. design system shadcn/ui + Tailwind CSS;
3. database PostgreSQL di Neon;
4. authentication moden;
5. RBAC + permission + record scope;
6. API modular;
7. PWA online-first;
8. migrasi modul teras daripada aplikasi asal;
9. struktur empat portfolio:
   - Pentadbiran;
   - Akademik;
   - Hal Ehwal Murid (HEM);
   - Kokurikulum;
10. pengujian, deployment, observability dan backup.

Blueprint ini **tidak menganggap semua fungsi dalam repository asal telah production-ready**. Setiap fungsi mesti diaudit sebelum dipindahkan.

---

# 2. Prinsip Seni Bina

## 2.1 Keputusan utama

| ID | Keputusan |
|---|---|
| A01 | Sistem ialah **single-school**, bukan SaaS multi-tenant |
| A02 | Tiada `school_id` atau `branch_id` diwajibkan pada jadual domain |
| A03 | Frontend dibina semula dalam TypeScript |
| A04 | Repo Scholarchy digunakan sebagai rujukan UI/workflow dan sumber komponen terpilih |
| A05 | Backend MongoDB/Mongoose asal tidak menjadi backend production SRIK |
| A06 | Database utama ialah Neon PostgreSQL |
| A07 | ORM/migration utama ialah Drizzle ORM + Drizzle Kit |
| A08 | API dibina sebagai modular monolith menggunakan Hono + TypeScript |
| A09 | Authentication diasingkan daripada authorization aplikasi |
| A10 | Role asas MVP: `ADMIN`, `TEACHER` |
| A11 | `PARENT` dan `STUDENT` hanya diaktifkan apabila portal masing-masing dibuka |
| A12 | Guru Data, Peperiksaan, Jadual, Kewangan dan tanggungjawab khas ialah **permission**, bukan role baharu |
| A13 | Empat portfolio ialah struktur navigasi, bukan sempadan keselamatan |
| A14 | PWA bermula sebagai online-first |
| A15 | Offline write tidak dibenarkan untuk markah, profil atau transaksi sensitif pada MVP |
| A16 | Kokurikulum boleh bermula sebagai portfolio dengan empty-state jujur |
| A17 | Portal waris, PBD penuh dan kewangan penuh ditangguhkan selepas core stabil |
| A18 | Semua operasi sensitif mesti direkodkan dalam audit log |
| A19 | Sistem mesti menyokong responsive desktop/mobile dan keyboard accessibility |
| A20 | Build, lint, typecheck, test dan security check mesti menjadi gate CI |

---

# 3. Seni Bina Sistem Sasaran

```text
+----------------------------------------------------------+
|                     USER DEVICES                         |
| Desktop / Tablet / Phone / Installed PWA                 |
+---------------------------+------------------------------+
                            |
                            | HTTPS
                            v
+----------------------------------------------------------+
| FRONTEND                                                 |
| Vite + React + TypeScript                                |
| React Router                                             |
| shadcn/ui + Tailwind                                     |
| TanStack Query                                           |
| React Hook Form + Zod                                    |
| vite-plugin-pwa                                          |
+---------------------------+------------------------------+
                            |
                            | REST/JSON
                            v
+----------------------------------------------------------+
| APPLICATION API                                          |
| Hono + TypeScript                                        |
| Auth middleware                                          |
| Permission middleware                                    |
| Record-scope checks                                      |
| Zod request validation                                   |
| Domain services                                          |
| Audit service                                            |
+-------------------+----------------+---------------------+
                    |                |
                    | SQL            | Object operations
                    v                v
+--------------------------+   +----------------------------+
| NEON POSTGRESQL          |   | OBJECT STORAGE             |
| Drizzle ORM              |   | Neon Storage / R2          |
| Constraints              |   | Private by default         |
| RLS where appropriate    |   | Signed URL access          |
+--------------------------+   +----------------------------+
          |
          +----------------------------------+
          |                                  |
          v                                  v
+-------------------------+       +--------------------------+
| AUTH                    |       | ASYNC/INTEGRATIONS       |
| Neon Auth / Better Auth |       | Email / jobs / exports   |
| Session management      |       | Optional worker          |
+-------------------------+       +--------------------------+
```

---

# 4. Stack Rasmi

## 4.1 Frontend

| Komponen | Pilihan |
|---|---|
| Build tool | Vite |
| Framework | React |
| Language | TypeScript |
| UI | shadcn/ui |
| Styling | Tailwind CSS |
| Primitive UI | Radix UI |
| Router | React Router |
| Server state | TanStack Query |
| Forms | React Hook Form |
| Validation | Zod |
| Icons | Lucide React |
| Toast | Sonner |
| Charts | Recharts |
| PWA | vite-plugin-pwa + Workbox |
| Local offline cache | IndexedDB/Dexie — kemudian |
| Date/time | date-fns |
| Utility | clsx + tailwind-merge |

## 4.2 Backend

| Komponen | Pilihan |
|---|---|
| Runtime | Node-compatible serverless runtime |
| API framework | Hono |
| Language | TypeScript |
| Validation | Zod |
| ORM | Drizzle ORM |
| Migration | Drizzle Kit |
| Database | Neon PostgreSQL |
| Authentication | Neon Auth / Better Auth integration |
| Authorization | Application RBAC + permission + record scope |
| Database protection | PostgreSQL constraints + selective RLS |
| Logging | Structured JSON logs |
| Error tracking | Sentry |
| Rate limiting | Provider/edge rate limit + app rules |

## 4.3 Testing

- Vitest
- React Testing Library
- Playwright
- API integration tests
- database migration tests
- permission matrix tests
- route regression tests
- PWA smoke tests

## 4.4 CI/CD

GitHub Actions:

```text
install
  ↓
lint
  ↓
typecheck
  ↓
unit test
  ↓
integration test
  ↓
build
  ↓
security/dependency scan
  ↓
deploy preview
  ↓
manual production promotion
```

Tiada auto-deploy production daripada branch feature.

---

# 5. Struktur Repository Sasaran

Cadangan: satu monorepo ringan.

```text
srik-portal/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ app/
│  │  │  │  ├─ router/
│  │  │  │  ├─ navigation/
│  │  │  │  ├─ portfolios/
│  │  │  │  └─ providers/
│  │  │  ├─ components/
│  │  │  │  ├─ ui/
│  │  │  │  ├─ layout/
│  │  │  │  ├─ forms/
│  │  │  │  └─ data-display/
│  │  │  ├─ features/
│  │  │  │  ├─ administration/
│  │  │  │  ├─ academic/
│  │  │  │  ├─ hem/
│  │  │  │  ├─ cocurricular/
│  │  │  │  └─ shared/
│  │  │  ├─ hooks/
│  │  │  ├─ lib/
│  │  │  ├─ i18n/
│  │  │  └─ types/
│  │  ├─ public/
│  │  └─ vite.config.ts
│  │
│  └─ api/
│     ├─ src/
│     │  ├─ app.ts
│     │  ├─ routes/
│     │  ├─ middleware/
│     │  ├─ modules/
│     │  │  ├─ auth/
│     │  │  ├─ users/
│     │  │  ├─ staff/
│     │  │  ├─ students/
│     │  │  ├─ guardians/
│     │  │  ├─ attendance/
│     │  │  ├─ academic/
│     │  │  ├─ exams/
│     │  │  ├─ timetable/
│     │  │  ├─ reports/
│     │  │  ├─ audit/
│     │  │  └─ files/
│     │  ├─ services/
│     │  ├─ policies/
│     │  ├─ db/
│     │  └─ lib/
│     └─ tests/
│
├─ packages/
│  ├─ db/
│  │  ├─ schema/
│  │  ├─ migrations/
│  │  └─ seed/
│  ├─ contracts/
│  ├─ config/
│  └─ shared/
│
├─ docs/
│  ├─ architecture/
│  ├─ database/
│  ├─ permissions/
│  ├─ migrations/
│  └─ testing/
│
├─ .github/
│  └─ workflows/
├─ package.json
└─ README.md
```

---

# 6. Empat Portfolio

Struktur portfolio mengikuti spesifikasi UI yang telah diluluskan.

## 6.1 Pentadbiran

Subkumpulan:

- Guru & Staf
- Kehadiran Staf
- Cuti & Perkhidmatan
- Kewangan
- Aset & Fasiliti
- Pengurusan Sistem

### MVP awal

- Guru & staf
- Profil sekolah
- pengguna & akses
- audit log
- asas kehadiran staf

### Ditangguh

- payroll penuh
- belanjawan
- inventori kompleks
- maintenance ticket penuh

---

## 6.2 Akademik

Subkumpulan:

- Tahun & Kelas
- Kurikulum & Subjek
- Agihan Pengajaran
- Jadual
- Pengajaran & Bahan
- Peperiksaan & Pentaksiran
- Laporan & Analisis

### MVP

- tahun akademik
- kelas
- mata pelajaran
- agihan guru
- jadual
- peperiksaan
- markah
- laporan

### Kemudian

- eRPH
- PBD penuh
- bahan pembelajaran
- tugasan
- guru ganti
- analisis item

---

## 6.3 HEM

Subkumpulan:

- Murid & Waris
- Kehadiran Murid
- Sahsiah & Disiplin
- Kebajikan & Kesihatan
- Keselamatan & Persetujuan
- Lifecycle Murid

### MVP

- murid
- waris
- hubungan murid-waris
- enrollment
- kehadiran harian
- status aktif/tamat/pindah asas

### Kemudian

- disiplin
- kesihatan
- kebajikan
- gate pass
- consent
- kaunseling

---

## 6.4 Kokurikulum

Subkumpulan:

- Unit & Keahlian
- Rumah Sukan
- Aktiviti & Kehadiran
- Pertandingan
- Pencapaian & Sijil

### MVP awal

Boleh dimulakan sebagai empty state jika data model belum siap.

### Urutan pembangunan

1. unit;
2. penasihat;
3. keahlian;
4. aktiviti;
5. kehadiran;
6. pertandingan;
7. pencapaian;
8. sijil.

---

# 7. Navigation Registry

Fail cadangan:

```text
apps/web/src/app/navigation/portfolioRegistry.ts
```

Kontrak:

```ts
type PortfolioId =
  | 'administration'
  | 'academic'
  | 'hem'
  | 'cocurricular'

type Readiness =
  | 'available'
  | 'placeholder'
  | 'deferred'
  | 'legacy-hold'

interface ModuleNavigationEntry {
  id: string
  portfolio: PortfolioId
  group: string
  titleKey: string
  path: string
  audiences: ('ADMIN' | 'TEACHER' | 'PARENT' | 'STUDENT')[]
  requiredPermissions?: string[]
  readiness: Readiness
  order: number
  aliases?: string[]
}
```

Aturan:

- registry bukan authorization backend;
- hanya `available` dipaparkan sebagai menu operasi;
- permission frontend hanya untuk UX;
- API tetap semak permission server-side;
- alias tidak mencipta menu kedua;
- detail page tidak menjadi item sidebar;
- registry tidak eager-import semua screen.

---

# 8. Routing

Cadangan URL baharu:

```text
/app
/app/administration
/app/academic
/app/hem
/app/cocurricular
```

Modul:

```text
/app/administration/staff
/app/administration/staff/:id
/app/academic/classes
/app/academic/timetable
/app/academic/exams
/app/academic/exams/:examId/marks
/app/hem/students
/app/hem/students/:studentId
/app/hem/attendance
/app/cocurricular/units
```

Legacy route dari repo asal boleh diberikan redirect terhad semasa migration.

Contoh:

```text
/admin/data-siswa
    ↓
/app/hem/students
```

Redirect menggunakan `replace` dan tidak menghasilkan history loop.

---

# 9. Authentication

## 9.1 Prinsip

Authentication menjawab:

> “Siapa pengguna?”

Authorization menjawab:

> “Apa yang pengguna dibenarkan buat terhadap rekod ini?”

Kedua-duanya mesti dipisahkan.

## 9.2 Lifecycle akaun

```text
ADMIN cipta jemputan
     ↓
Sistem cipta token jemputan
     ↓
Pengguna buka pautan
     ↓
Set password / verify identity
     ↓
Auth account created
     ↓
Profile linked
     ↓
Role/permission assigned
     ↓
Account ACTIVE
```

Status:

```text
INVITED
ACTIVE
SUSPENDED
DISABLED
```

Self-registration awam tidak digunakan untuk MVP.

---

# 10. Authorization

## 10.1 Role

### MVP

```text
ADMIN
TEACHER
```

### Future

```text
PARENT
STUDENT
```

---

## 10.2 Permission

Format:

```text
<domain>.<resource>.<action>
```

Contoh:

```text
staff.read
staff.write

student.read
student.write

attendance.student.take
attendance.student.read

academic.class.manage
academic.subject.manage

timetable.read
timetable.manage

exam.manage
exam.marks.write
exam.marks.review
exam.marks.approve
exam.publish

report.read
report.print

system.user.manage
system.audit.read
```

---

## 10.3 Scope

Permission sahaja tidak cukup.

Contoh:

```text
TEACHER
permission: exam.marks.write

scope:
- subject = Bahasa Melayu
- class = 3 Al-Junaidi
- academic_year = 2026
```

Guru tidak automatik boleh melihat semua murid.

---

# 11. Model Data Utama

## 11.1 Identity & Access

```text
profiles
roles
permissions
user_roles
role_permissions
user_permissions
account_invitations
login_audit
```

### profiles

```text
id uuid PK
auth_user_id text UNIQUE
display_name text
email text
phone text
status enum
created_at timestamptz
updated_at timestamptz
```

---

# 12. Domain Guru & Staf

## staff

```text
id uuid PK
profile_id uuid nullable
staff_no text UNIQUE
full_name text
ic_no text nullable
gender enum nullable
date_of_birth date nullable
phone text nullable
email text nullable
address text nullable
employment_type text
employment_status text
join_date date
end_date date nullable
created_at timestamptz
updated_at timestamptz
```

## staff_attendance

```text
id uuid PK
staff_id uuid FK
attendance_date date
status enum
check_in timestamptz nullable
check_out timestamptz nullable
notes text nullable
recorded_by uuid
created_at timestamptz

UNIQUE(staff_id, attendance_date)
```

---

# 13. Domain Murid & Waris

## students

```text
id uuid PK
student_no text UNIQUE
full_name text
ic_no text nullable
birth_certificate_no text nullable
gender enum
date_of_birth date
birth_place text nullable
status enum
enrollment_date date
exit_date date nullable
created_at timestamptz
updated_at timestamptz
```

## guardians

```text
id uuid PK
profile_id uuid nullable
full_name text
ic_no text nullable
phone text
email text nullable
occupation text nullable
address text nullable
created_at timestamptz
updated_at timestamptz
```

## student_guardians

```text
student_id uuid FK
guardian_id uuid FK
relationship text
is_primary boolean
is_emergency_contact boolean
can_receive_results boolean

PRIMARY KEY(student_id, guardian_id)
```

---

# 14. Tahun Akademik, Kelas dan Enrollment

## academic_years

```text
id uuid PK
name text
start_date date
end_date date
is_current boolean
status enum
```

Hanya satu academic year aktif secara logik.

## classes

```text
id uuid PK
academic_year_id uuid FK
year_level smallint
name text
class_teacher_id uuid nullable
status enum

UNIQUE(academic_year_id, name)
```

## enrollments

```text
id uuid PK
student_id uuid FK
class_id uuid FK
academic_year_id uuid FK
enrolled_at date
left_at date nullable
status enum

UNIQUE(student_id, academic_year_id)
```

---

# 15. Mata Pelajaran & Agihan Guru

## subjects

```text
id uuid PK
code text UNIQUE
name_ms text
name_en text nullable
is_active boolean
```

## teaching_assignments

```text
id uuid PK
academic_year_id uuid FK
teacher_id uuid FK
class_id uuid FK
subject_id uuid FK
is_primary boolean

UNIQUE(
  academic_year_id,
  teacher_id,
  class_id,
  subject_id
)
```

---

# 16. Jadual

## timetable_entries

```text
id uuid PK
academic_year_id uuid FK
class_id uuid FK
subject_id uuid FK
teacher_id uuid FK
day_of_week smallint
period_no smallint
start_time time
end_time time
room text nullable
```

Constraint aplikasi mesti mengesan:

- pertindihan guru;
- pertindihan kelas;
- pertindihan bilik jika digunakan.

---

# 17. Kehadiran Murid

## student_attendance

```text
id uuid PK
student_id uuid FK
class_id uuid FK
attendance_date date
status enum
reason text nullable
recorded_by uuid
recorded_at timestamptz

UNIQUE(student_id, attendance_date)
```

Status asas:

```text
PRESENT
ABSENT
SICK
EXCUSED
LATE
```

Untuk MVP, kehadiran sekali sehari mengikut kelas.

---

# 18. Peperiksaan

## exams

```text
id uuid PK
academic_year_id uuid FK
name text
term text nullable
exam_type text
start_date date nullable
end_date date nullable
status enum
created_by uuid
created_at timestamptz
```

## exam_subjects

```text
id uuid PK
exam_id uuid FK
subject_id uuid FK
class_id uuid FK
max_score numeric
grading_scheme_id uuid nullable
```

## exam_marks

```text
id uuid PK
exam_subject_id uuid FK
student_id uuid FK
score numeric nullable
grade text nullable
remarks text nullable
entered_by uuid
reviewed_by uuid nullable
approved_by uuid nullable
updated_at timestamptz

UNIQUE(exam_subject_id, student_id)
```

---

# 19. Workflow Peperiksaan

Status rasmi:

```text
DRAFT
REVIEW
APPROVED
PUBLISHED
```

Aliran:

```text
Guru isi markah
     ↓
DRAFT
     ↓
Hantar untuk semakan
     ↓
REVIEW
     ↓
Semak / pulangkan pembetulan
     ↓
APPROVED
     ↓
Terbit
     ↓
PUBLISHED
```

Aturan:

- guru hanya edit sebelum lock;
- reviewer tidak semestinya admin;
- publish memerlukan permission;
- published result tidak diubah secara senyap;
- pembetulan selepas publish mesti mempunyai audit trail.

---

# 20. Report Card

Jadual cadangan:

```text
report_cards
report_card_items
report_publications
```

Namun elakkan menyimpan data duplikat jika laporan boleh dibina daripada markah.

Cadangan:

- snapshot hanya ketika publish;
- report card mempunyai version;
- PDF dijana daripada snapshot;
- cetakan semula sentiasa merujuk version yang diterbitkan.

---

# 21. Kokurikulum

Schema awal:

```text
cocurricular_units
unit_advisors
unit_memberships
cocurricular_activities
activity_attendance
competitions
achievements
certificates
```

Tidak perlu diaktifkan serentak dengan MVP akademik.

---

# 22. Audit Log

## audit_logs

```text
id uuid PK
actor_user_id uuid
action text
resource_type text
resource_id text
before_json jsonb nullable
after_json jsonb nullable
ip_address inet nullable
user_agent text nullable
request_id text
created_at timestamptz
```

Wajib audit:

- perubahan role/permission;
- tambah/edit/padam guru;
- tambah/edit/padam murid;
- perubahan hubungan waris;
- perubahan markah;
- approve/publish result;
- perubahan data kewangan;
- export data sensitif.

Jangan log password, session token atau secret.

---

# 23. API Design

Base:

```text
/api/v1
```

## Authentication

```text
GET    /auth/session
POST   /auth/logout
POST   /auth/invitations
POST   /auth/invitations/:token/accept
```

## Staff

```text
GET    /staff
POST   /staff
GET    /staff/:id
PATCH  /staff/:id
```

## Students

```text
GET    /students
POST   /students
GET    /students/:id
PATCH  /students/:id
POST   /students/:id/guardians
```

## Classes

```text
GET    /academic-years
GET    /classes
POST   /classes
PATCH  /classes/:id
```

## Attendance

```text
GET    /attendance/students
POST   /attendance/students/bulk
GET    /attendance/students/:studentId
```

Bulk payload:

```json
{
  "classId": "...",
  "date": "2026-10-31",
  "records": [
    {
      "studentId": "...",
      "status": "PRESENT"
    }
  ]
}
```

## Exams

```text
GET    /exams
POST   /exams
GET    /exams/:id
POST   /exams/:id/subjects

GET    /exam-subjects/:id/marks
PUT    /exam-subjects/:id/marks

POST   /exams/:id/submit-review
POST   /exams/:id/approve
POST   /exams/:id/publish
```

---

# 24. API Response Contract

Success:

```json
{
  "data": {},
  "meta": {},
  "requestId": "..."
}
```

Error:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Anda tidak mempunyai akses.",
    "details": null
  },
  "requestId": "..."
}
```

Jangan pulangkan stack trace kepada client.

---

# 25. Database Rules

## 25.1 UUID

Gunakan UUID untuk primary key domain.

## 25.2 Soft delete

Jangan gunakan soft delete secara automatik pada semua jadual.

Gunakan status lifecycle untuk:

- murid;
- guru;
- akaun;
- tahun akademik.

Soft delete hanya jika benar-benar diperlukan.

## 25.3 Constraint

Gunakan database constraint, bukan bergantung sepenuhnya kepada UI.

Contoh:

- unique student number;
- unique staff number;
- unique enrollment per year;
- unique attendance per day;
- unique exam mark record;
- FK dengan delete behaviour eksplisit.

---

# 26. RLS Strategy

RLS tidak menggantikan authorization aplikasi.

Cadangan:

### Wajib pertimbangkan RLS

- student sensitive profile;
- guardian;
- exam marks;
- health/discipline kemudian;
- financial data.

### Prinsip

1. API mengesahkan session.
2. API mengesahkan permission.
3. API mengesahkan record scope.
4. Database constraint/RLS menjadi defense-in-depth.

Jangan beri credential database privileged kepada browser.

---

# 27. Object Storage

Simpan objek berikut di storage:

```text
profile-images/
student-documents/
staff-documents/
report-cards/
certificates/
imports/
exports/
```

Rules:

- private by default;
- signed URL;
- MIME validation;
- size limit;
- filename rawak;
- malware scanning jika dokumen awam mula diterima;
- metadata objek disimpan dalam PostgreSQL.

---

# 28. Import Excel

Repo asal mempunyai fungsi import/export Excel. Konsep boleh dikekalkan tetapi flow perlu diubah.

Flow:

```text
Upload
  ↓
Parse server-side
  ↓
Validate schema
  ↓
Preview
  ↓
Show errors
  ↓
Confirm
  ↓
Transaction
  ↓
Audit log
```

Jangan terus insert ke database daripada fail Excel tanpa preview.

Gunakan import template versioned.

---

# 29. Export

Format:

- XLSX
- CSV
- PDF

Semua export sensitif mesti:

- mematuhi permission;
- menggunakan scope pengguna;
- direkodkan dalam audit log;
- tidak mendedahkan medan yang tidak diperlukan.

---

# 30. PWA

## MVP

```text
Installable
App shell cached
Static assets cached
Read-only safe cache untuk data terpilih
Online write
Offline page
Update notification
```

## Jangan cache

- auth responses;
- health data;
- discipline data;
- mark entry payload;
- financial data;
- guardian secrets;
- signed file URL jangka panjang.

## Future offline attendance

Boleh ditambah selepas MVP menggunakan:

```text
IndexedDB
mutation queue
idempotency key
sync status
conflict detection
```

---

# 31. i18n

Default:

```text
ms
```

Fallback:

```text
en
```

Contoh key:

```text
portfolio.administration.title
portfolio.academic.title
portfolio.hem.title
portfolio.cocurricular.title

student.list.title
student.form.fullName
attendance.status.present
exam.workflow.review
```

Jangan campur hardcoded BM/English dalam komponen.

---

# 32. Accessibility

Wajib:

- keyboard navigation;
- visible focus;
- semantic table;
- aria-label;
- form error association;
- contrast mencukupi;
- warna bukan satu-satunya penanda;
- dialog dengan focus trap;
- minimum target sentuh sesuai mobile.

Sasaran praktikal:

```text
WCAG 2.2 AA
```

---

# 33. Security Baseline

Wajib sebelum production:

- HTTPS only;
- secure session cookie;
- CSRF strategy mengikut auth architecture;
- rate limiting;
- Zod validation;
- server-side authorization;
- password/session handled by auth provider;
- secrets tidak pernah dalam frontend bundle;
- no service-role key dalam client;
- dependency scan;
- audit log;
- immutable-ish result publication trail;
- backup;
- restore test;
- structured logging;
- error monitoring.

---

# 34. Migration daripada Scholarchy

## Jangan buat big-bang rewrite tanpa inventori.

### M0 — Inventory

Klasifikasikan setiap fail:

```text
REUSE
PORT
REWRITE
DROP
REFERENCE_ONLY
```

### Contoh

| Komponen asal | Keputusan awal |
|---|---|
| layout/sidebar | PORT / REFERENCE |
| table components | PORT selepas TypeScript |
| React Hook Form patterns | REUSE konsep |
| dashboard charts | PORT jika masih relevan |
| Redux auth | REWRITE |
| JWT auth | DROP |
| Express controllers | REFERENCE_ONLY |
| Mongoose models | DROP |
| Excel UI | PORT selepas audit |
| print layout | PORT selepas audit |

---

# 35. Migration Data MongoDB → PostgreSQL

Jika data production lama hendak dibawa:

```text
Mongo export
  ↓
Normalize
  ↓
Transform IDs
  ↓
Validate
  ↓
Load staging schema
  ↓
Reconcile
  ↓
Load production
  ↓
Generate migration report
```

Mapping contoh:

```text
siswa          → students
guru           → staff
kelas          → classes
mapel          → subjects
jadwal         → timetable_entries
absensi        → student_attendance
nilai          → exam_marks
tahunAjaran    → academic_years
```

Tidak boleh migrate terus sebelum schema PostgreSQL dikunci.

---

# 36. State Management

Gunakan:

### TanStack Query

Untuk server state:

- students;
- staff;
- classes;
- exams;
- attendance;
- timetable.

### React local state

Untuk:

- modal;
- filters sementara;
- selected tab;
- form interaction.

### Global state

Minimum sahaja:

- session UI summary;
- theme;
- locale;
- global shell state.

Redux tidak wajib diteruskan jika tiada keperluan sebenar.

---

# 37. Error Handling

UI mesti bezakan:

```text
loading
empty
permission denied
network error
server error
not found
feature unavailable
```

Jangan tukar:

```text
network error
```

menjadi:

```text
0 murid
```

---

# 38. Observability

Minimum production:

```text
request_id
user_id
route
status
duration_ms
error_code
```

Tools:

- Sentry
- provider logs
- database monitoring

Dashboard operasi minimum:

- API error rate;
- DB query latency;
- auth failure;
- failed jobs;
- failed exports;
- storage errors.

---

# 39. Backup

Minimum:

### Database

- Neon restore capability;
- tambahan dump berkala;
- encrypted storage offsite;
- retention berperingkat.

Cadangan:

```text
daily: 7
weekly: 4
monthly: 6
```

### Object storage

Versioning atau lifecycle backup jika provider menyokong.

### Restore Drill

Sekurang-kurangnya berkala:

```text
backup
  ↓
restore staging
  ↓
run integrity checks
  ↓
record result
```

Backup tanpa restore test tidak dianggap cukup.

---

# 40. Environment

```text
local
preview
staging
production
```

Jangan gunakan database production untuk automated test.

Environment secrets dipisahkan.

---

# 41. CI Quality Gates

Pull request tidak boleh merge jika:

```text
lint fail
typecheck fail
unit test fail
integration fail
build fail
migration validation fail
critical dependency alert
```

Production deploy memerlukan explicit approval.

---

# 42. Testing Matrix

## Unit

- permission helpers;
- grading helpers;
- date helpers;
- registry;
- validators.

## Component

- form;
- table;
- dialog;
- portfolio landing;
- access state.

## Integration

- student CRUD;
- attendance;
- exam mark entry;
- approval workflow;
- account invitation.

## E2E

### Admin

```text
login
create teacher
create student
create class
assign teacher
create exam
publish result
logout
```

### Teacher

```text
login
view class
take attendance
enter marks
submit review
logout
```

---

# 43. Permission Test Matrix

Contoh:

| Scenario | Expected |
|---|---|
| ADMIN edit murid | Allow |
| TEACHER biasa edit semua murid | Deny |
| TEACHER lihat kelas sendiri | Allow |
| TEACHER isi markah subjek sendiri | Allow |
| TEACHER isi markah subjek guru lain | Deny |
| TEACHER publish result tanpa permission | Deny |
| direct API tanpa session | 401 |
| session sah tanpa permission | 403 |

---

# 44. MVP Scope

## Pentadbiran

- auth;
- pengguna;
- guru/staf;
- permission;
- audit;
- profil sekolah asas.

## Akademik

- academic year;
- class;
- subject;
- teaching assignment;
- timetable;
- exams;
- marks;
- report card.

## HEM

- students;
- guardians;
- enrollment;
- student attendance.

## Kokurikulum

- landing/empty state;
- schema design;
- implementation selepas core.

---

# 45. Bukan MVP

- payroll penuh;
- finance accounting;
- PBD lengkap;
- eRPH integration;
- counselling;
- medical records;
- parent portal;
- student portal;
- offline mutation penuh;
- PAJSK;
- SEGAK;
- complex inventory;
- messaging/chat realtime.

---

# 46. Development Phases

## Phase 0 — Foundation Audit

Deliverables:

```text
REPO_AUDIT.md
ROUTE_INVENTORY.md
FEATURE_INVENTORY.md
MIGRATION_MATRIX.md
```

Gate:

- semua route asal dikelaskan;
- dependency audit selesai;
- baseline build diketahui.

---

## Phase 1 — Project Skeleton

Bina:

- monorepo;
- Vite TSX;
- shadcn;
- router;
- TanStack Query;
- i18n;
- test stack;
- CI.

Gate:

```text
lint
typecheck
test
build
```

semua lulus.

---

## Phase 2 — Four Portfolio UI

Bina:

- portfolio registry;
- dashboard;
- landing Pentadbiran;
- landing Akademik;
- landing HEM;
- landing Kokurikulum;
- sidebar;
- breadcrumb;
- responsive navigation.

Gate:

- UI spec empat portfolio dipatuhi;
- placeholder tidak muncul sebagai modul aktif.

---

## Phase 3 — Database Foundation

Bina:

- Neon project;
- Drizzle;
- schema identity;
- academic years;
- staff;
- students;
- guardians;
- classes;
- subjects;
- migrations;
- seed.

Gate:

- clean migration from zero;
- migration repeatable;
- constraints diuji.

---

## Phase 4 — Auth & Authorization

Bina:

- auth integration;
- invitation;
- profile linking;
- roles;
- permissions;
- scope;
- middleware;
- audit.

Gate:

- permission matrix test lulus;
- privilege escalation test gagal seperti sepatutnya.

---

## Phase 5 — Core Master Data

Bina:

- staff;
- students;
- guardians;
- academic years;
- classes;
- subjects;
- teaching assignments.

Gate:

- admin CRUD;
- teacher read scope;
- no cross-scope leakage.

---

## Phase 6 — Attendance

Bina:

- student daily attendance;
- staff attendance jika diperlukan;
- reports;
- CSV/XLSX export.

Gate:

- duplicate attendance blocked;
- teacher hanya kelas dibenarkan.

---

## Phase 7 — Timetable

Bina:

- timetable editor;
- teacher timetable;
- class timetable;
- collision checks.

Gate:

- tiada double-book teacher/class.

---

## Phase 8 — Examination

Bina:

- exams;
- exam subjects;
- mark entry;
- review;
- approve;
- publish;
- report card;
- PDF/print.

Gate:

- Draft → Review → Approved → Published lulus;
- unauthorized publication ditolak.

---

## Phase 9 — PWA & Production Hardening

Bina:

- manifest;
- service worker;
- offline shell;
- update handling;
- Sentry;
- backup automation;
- rate limiting;
- security headers.

Gate:

- PWA install;
- no sensitive API cache;
- backup restore drill.

---

## Phase 10 — Future Modules

Selepas core stabil:

- Kokurikulum;
- HEM lanjutan;
- PBD;
- Parent Portal;
- Student Portal;
- finance asas.

---

# 47. Definition of Done

Satu feature hanya dianggap siap apabila:

1. UI lengkap;
2. API lengkap;
3. authorization server-side lengkap;
4. database constraints lengkap;
5. audit jika diperlukan;
6. loading/error/empty state lengkap;
7. responsive;
8. BM translation lengkap;
9. tests lengkap;
10. build lulus;
11. accessibility asas lulus;
12. dokumentasi dikemas kini.

---

# 48. Coding Rules untuk Harness

Harness mesti:

1. membaca `AGENTS.md`, `CLAUDE.md` dan arahan repo sebelum ubah kod;
2. memeriksa HEAD dan dirty worktree;
3. tidak reset perubahan pengguna;
4. membuat perubahan kecil dan terasing;
5. tidak mencipta permission string tanpa update dokumentasi;
6. tidak memintas backend authorization;
7. tidak memasukkan secret ke source;
8. tidak update dependency major tanpa keputusan;
9. tidak merge/push/deploy tanpa arahan;
10. menyediakan bukti command dan exit code.

---

# 49. Branch Strategy

Cadangan:

```text
main
develop (optional)
feature/*
fix/*
migration/*
```

Commit contoh:

```text
feat(nav): add portfolio registry
feat(auth): add invitation lifecycle
feat(students): add student list API
feat(exams): add review workflow
test(authz): cover teacher class scope
```

Elakkan mega-commit.

---

# 50. API Security Checklist

```text
[ ] session validated
[ ] request validated by Zod
[ ] permission checked
[ ] record scope checked
[ ] DB constraint exists
[ ] audit logged if sensitive
[ ] response fields minimized
[ ] error sanitized
[ ] test covers unauthorized access
```

---

# 51. Data Classification

## Public / Low Sensitivity

- nama sekolah;
- pengumuman umum.

## Internal

- jadual;
- kelas;
- subjek.

## Confidential

- profil guru;
- profil murid;
- waris;
- kehadiran;
- markah.

## Highly Sensitive

Kemudian:

- kesihatan;
- kaunseling;
- disiplin terperinci;
- kewangan.

UI dan API mesti mengambil klasifikasi ini kira dalam logging, caching dan export.

---

# 52. Production Readiness Gate

Production tidak diluluskan sehingga:

```text
[ ] DB migrations clean
[ ] CI green
[ ] permission matrix green
[ ] backup configured
[ ] restore tested
[ ] Sentry configured
[ ] secrets rotated
[ ] HTTPS enforced
[ ] rate limiting enabled
[ ] PWA cache audited
[ ] privacy-sensitive screens audited
[ ] audit log tested
[ ] exam publish tested
[ ] mobile tested
[ ] desktop tested
[ ] Chrome/Edge/Safari smoke tested
```

---

# 53. Deployment Recommendation

## Preferred Architecture A

```text
Frontend:
Cloudflare Pages / equivalent static hosting

API:
Cloudflare Workers + Hono

Database:
Neon PostgreSQL

Auth:
Neon Auth

Storage:
R2 / Neon-compatible object storage

Monitoring:
Sentry
```

Kelebihan:

- matang;
- edge-friendly;
- deployment mudah;
- scalable;
- sesuai untuk sekolah kecil/sederhana.

---

## Architecture B

```text
Frontend:
Static hosting

API:
Neon Functions

DB/Auth/Storage:
Neon ecosystem
```

Gunakan jika proof-of-concept menunjukkan runtime, deployment, observability dan timeout memenuhi keperluan.

---

# 54. Keputusan Mengenai Repo Asal

Repository `anwarhakim31/School-Management` tidak perlu dibuang.

Gunakan sebagai:

```text
UI reference
workflow reference
component donor
printing reference
Excel workflow reference
feature checklist
```

Jangan jadikan:

```text
final database design
final auth design
final permission model
final backend architecture
security baseline
```

---

# 55. Keputusan Muktamad Stack

```text
Frontend
  Vite
  React
  TypeScript
  shadcn/ui
  Tailwind
  React Router
  TanStack Query
  React Hook Form
  Zod

Backend
  Hono
  TypeScript
  Neon PostgreSQL
  Drizzle ORM
  Neon Auth
  RBAC + Permissions + Scope
  PostgreSQL constraints
  selective RLS

PWA
  vite-plugin-pwa
  Workbox
  online-first

Infrastructure
  Cloudflare / Neon
  Object Storage
  GitHub Actions
  Sentry
  automated backup
```

---

# 56. Urutan Pembangunan Disyorkan

Urutan rasmi:

```text
01 Audit repo asal
02 Bootstrap monorepo TS
03 Empat portfolio
04 Database foundation
05 Auth
06 Role/permission/scope
07 Guru & staf
08 Murid & waris
09 Tahun/kelas/subjek
10 Agihan guru
11 Kehadiran
12 Jadual
13 Peperiksaan
14 Report card
15 PWA
16 Hardening
17 Kokurikulum
18 Parent Portal
19 PBD
20 Finance
```

---

# 57. Deliverables Harness yang Dicadangkan

```text
docs/
├─ architecture/
│  ├─ SRIK_BLUEPRINT_v1.0.md
│  ├─ SYSTEM_CONTEXT.md
│  └─ DEPLOYMENT.md
├─ database/
│  ├─ ERD.md
│  ├─ SCHEMA_DECISIONS.md
│  └─ MIGRATION_PLAN.md
├─ permissions/
│  ├─ PERMISSION_MATRIX.md
│  └─ RECORD_SCOPE.md
├─ ui/
│  ├─ ROUTE_INVENTORY.md
│  └─ PORTFOLIO_REGISTRY.md
└─ validation/
   ├─ TEST_PLAN.md
   └─ PRODUCTION_READINESS.md
```

---

# 58. Prompt Pelaksanaan untuk DeepSeek Harness

> Gunakan `SRIK Portal — Architecture & Migration Blueprint v1.0` bersama spesifikasi empat portfolio sebagai sumber keputusan seni bina. Repository `anwarhakim31/School-Management` ialah rujukan UI/workflow, bukan backend production. Mulakan dengan audit repository dan hasilkan inventori route, feature, dependency serta migration matrix. Kemudian bina foundation Vite + React + TypeScript + shadcn/ui + TanStack Query dalam struktur modular. Gunakan Neon PostgreSQL, Drizzle ORM, authentication provider yang diluluskan, Hono API dan authorization role + permission + record scope. Empat portfolio ialah Pentadbiran, Akademik, HEM dan Kokurikulum dan tidak boleh digunakan sebagai role keselamatan. Kekalkan single-school architecture tanpa `school_id` dan `branch_id`. Parent/Student portal, PBD penuh, finance penuh dan Kokurikulum lengkap bukan MVP. Semua operasi sensitif mesti melalui authorization server-side, validation, database constraint dan audit log apabila relevan. PWA hendaklah online-first dan tidak cache data sensitif secara lalai. Laksanakan secara fasa, commit kecil, ujian wajib, dan jangan push/merge/deploy tanpa arahan pemilik.

---

# 59. Status Blueprint

**Architecture:** APPROVED FOR IMPLEMENTATION PLANNING  
**Database:** DESIGN BASELINE  
**Auth:** DESIGN BASELINE  
**UI Portfolio:** LOCKED BY SRIK FOUR-PORTFOLIO SPEC  
**MVP Scope:** DEFINED  
**Production Deployment:** REQUIRES IMPLEMENTATION VALIDATION  

Blueprint ini boleh dikembangkan kepada v1.1 selepas:
- audit repository sebenar selesai;
- ERD disemak;
- permission matrix dimuktamadkan;
- pilihan runtime API Neon Functions vs Cloudflare Workers diuji melalui POC.
