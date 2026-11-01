# PANDUAN ISI — Templat Import SRIK

**Untuk:** pentadbir sekolah
**Sebelum:** jalankan `docs/releases/v1.4.1/REAL_DATA_ONBOARDING.md` §5 (runbook import pertama)
**Lokasi fail:** `docs/releases/v1.4.1/templates/`

> Fail dijana daripada kod yang sama yang menerima muat naik (`scripts/generate-import-templates.ts`),
> jadi lajur tidak boleh tersasar daripada yang API terima. **Jangan tambah, buang atau susun semula
> lajur** — parser menolak fail yang tidak sepadan.

---

## 1. Susunan import (wajib ikut)

```text
1. SRIK_IMPORT_SUBJECTS.xlsx      subjek
2. SRIK_IMPORT_STAFF.xlsx         guru & staf
3. SRIK_IMPORT_CLASSES.xlsx       kelas (perlu guru untuk guru kelas)
4. SRIK_IMPORT_STUDENTS.xlsx      murid
5. SRIK_IMPORT_ENROLLMENTS.xlsx   keahlian kelas (perlu murid + kelas)
6. SRIK_IMPORT_ASSIGNMENTS.xlsx   agihan pengajaran (perlu guru + kelas + subjek)
```

Sebab susunan: setiap fail kemudian merujuk pengenal yang dicipta oleh fail sebelumnya. Guru kelas
dalam `CLASSES` memerlukan `staff_no` yang sudah wujud, jadi STAFF diimport sebelum CLASSES.

---

## 2. Struktur setiap fail

| Lembaran | Guna |
|---|---|
| `_template` | metadata (`entity_type`, `template_version`). **Jangan ubah.** |
| `ARAHAN` | lajur, wajib/tidak, contoh, nota. Rujukan sahaja. |
| data (cth. `SUBJECTS`) | **isi di sini** — baris 2 dan seterusnya. Baris 1 ialah header. |
| `RUJUKAN_<ENTITI>` | nilai sedia ada dalam pangkalan data (tahun akademik, kelas, staf, subjek). Tidak diimport. |

Fail dihantar **kosong** (header sahaja) — tiada baris contoh yang boleh terimport secara tidak sengaja.

---

## 3. Peraturan am

| Perkara | Peraturan |
|---|---|
| Pengenal | guna `staff_no`, `student_no`, `subject_code`, `academic_year` + `class_name` — **jangan guna UUID** |
| Tarikh | hanya `YYYY-MM-DD` (cth. `2017-05-10`). `01/05/2017` ditolak |
| Boolean | `TRUE` / `FALSE` (boleh `YA`/`TIDAK`, `1`/`0`) |
| Sel kosong | dibenarkan untuk lajur tidak wajib; baris kosong sepenuhnya diabaikan |
| Baris separa | jika lajur wajib kosong → baris itu **TIDAK SAH** dan menyekat pengesahan |
| Formula | jangan guna formula; taip nilai |
| Saiz | maksimum 10 MB / 5 000 baris |
| Format | `.xlsx` sahaja (`.xls` ditolak) |

---

## 4. Lajur setiap fail

### 4.1 `SRIK_IMPORT_SUBJECTS.xlsx`

| Lajur | Wajib | Nota |
|---|---|---|
| `subject_code` | ✅ | unik, ditukar HURUF BESAR automatik (cth. `bm` → `BM`) |
| `name_ms` | ✅ | nama Bahasa Melayu |
| `name_en` | — | pilihan |
| `is_active` | — | lalai `TRUE` |

Pendua: `subject_code` yang sudah wujud → **DUPLICATE** (dilangkau).

### 4.2 `SRIK_IMPORT_STAFF.xlsx`

| Lajur | Wajib | Nota |
|---|---|---|
| `staff_no` | ✅ | unik (cth. `G001`) |
| `full_name` | ✅ | |
| `email_alias` | — | dinormalkan huruf kecil; **bukan** peti masuk sebenar |
| `phone` | — | |
| `position` | — | cth. `GURU`, `PEMBANTU TADBIR` |
| `employment_status` | — | `ACTIVE` (lalai) / `RESIGNED` / `RETIRED` |

Import staf **tidak** mencipta akaun login. Akaun disediakan berasingan di
`/app/administration/users`.

### 4.3 `SRIK_IMPORT_CLASSES.xlsx`

| Lajur | Wajib | Nota |
|---|---|---|
| `academic_year` | ✅ | mesti sepadan dengan `RUJUKAN` (cth. `2026/2027`) |
| `year_level` | ✅ | `1`–`6` |
| `class_name` | ✅ | unik dalam tahun tersebut |
| `class_teacher_staff_no` | — | mesti wujud & `ACTIVE` |
| `status` | — | `ACTIVE` (lalai) / `ARCHIVED` |

### 4.4 `SRIK_IMPORT_STUDENTS.xlsx`

| Lajur | Wajib | Nota |
|---|---|---|
| `student_no` | ✅ | unik (cth. `M001`) |
| `full_name` | ✅ | |
| `gender` | ✅ untuk murid baharu | `MALE` / `FEMALE` |
| `date_of_birth` | ✅ untuk murid baharu | `YYYY-MM-DD` |
| `status` | — | `ACTIVE` (lalai) / `GRADUATED` / `TRANSFERRED` / `WITHDRAWN` |

Import murid **tidak** mencipta akaun login murid.

### 4.5 `SRIK_IMPORT_ENROLLMENTS.xlsx`

| Lajur | Wajib | Nota |
|---|---|---|
| `academic_year` | ✅ | |
| `student_no` | ✅ | mesti sudah wujud |
| `class_name` | ✅ | mesti wujud dalam tahun tersebut |
| `status` | — | `ACTIVE` (lalai) / `TRANSFERRED` / `WITHDRAWN` / `COMPLETED` |
| `enrolled_at` | — | `YYYY-MM-DD`; lalai hari ini |

Satu murid = satu baris per tahun. Jika murid sudah berdaftar dalam **kelas lain**:

```text
CONFLICT → ADMIN pilih:  Langkau  atau  Ganti kelas
```

Murid **tidak** dipindahkan secara senyap.

### 4.6 `SRIK_IMPORT_ASSIGNMENTS.xlsx`

| Lajur | Wajib | Nota |
|---|---|---|
| `academic_year` | ✅ | |
| `teacher_staff_no` | ✅ | mesti wujud & aktif |
| `class_name` | ✅ | mesti wujud dalam tahun tersebut |
| `subject_code` | ✅ | mesti wujud & aktif |
| `is_primary` | — | `TRUE` jika guru utama untuk subjek/kelas itu |

Agihan ini menjadi asas jadual waktu dan kebenaran isi markah peperiksaan — pastikan tepat.

---

## 5. Selepas mengisi

1. Simpan sebagai `.xlsx` (kekalkan nama fail).
2. Log masuk sebagai ADMIN → `/app/administration/data-import`.
3. Pilih jenis data → muat naik fail → pengesahan berjalan automatik.
4. Semak pratonton:
   - **Tidak Sah** → betulkan fail dan muat naik semula (tiada data ditulis).
   - **Pendua** → akan dilangkau; tiada rekod kedua dicipta.
   - **Konflik** → pilih *Langkau* atau *Ganti kelas*.
5. Tekan **Sahkan Import** hanya apabila tiada baris *Tidak Sah*.
6. Semak skrin berkaitan (staf / kelas / murid / agihan) dan rekod kiraan dalam
   `docs/releases/v1.4.1/REAL_DATA_ONBOARDING.md` §7.

---

## 6. Ralat biasa dan maksudnya

| Mesej | Punca | Tindakan |
|---|---|---|
| `IMPORT_COLUMN_MISSING` | lajur wajib hilang/dinamakan semula | guna templat asal, jangan ubah header |
| `IMPORT_TEMPLATE_UNSUPPORTED` | fail jenis lain atau versi templat lama | muat turun templat terkini |
| `INVALID_ACADEMIC_YEAR` | `academic_year` tidak sepadan | salin tepat dari `RUJUKAN` |
| `INVALID_CLASS` | kelas tiada dalam tahun tersebut | import kelas dahulu |
| `INVALID_TEACHER` | `staff_no` tiada/tidak aktif | import staf dahulu |
| `INVALID_SUBJECT` / `SUBJECT_INACTIVE` | kod subjek tiada atau dinyahaktifkan | import/aktifkan subjek dahulu |
| `INVALID_DATE` | format tarikh bukan `YYYY-MM-DD` | betulkan format |
| `IMPORT_DUPLICATE` | pengenal berulang **dalam fail yang sama** | buang baris berulang |
| `ENROLLMENT_EXISTS` | murid sudah berdaftar tahun itu | guna *Ganti kelas* jika perlu tukar |
| `IMPORT_STALE_PREVIEW` | data berubah selepas pratonton | tekan **Sahkan Semula** |

---

## 7. Semakan akhir sebelum menghantar

```text
[ ] header tidak diubah
[ ] tiada baris contoh tertinggal
[ ] semua pengenal sepadan dengan helaian RUJUKAN
[ ] tiada formula dalam sel
[ ] tarikh dalam bentuk YYYY-MM-DD
[ ] tiada pendua dalam fail yang sama
[ ] fail disimpan sebagai .xlsx
```
