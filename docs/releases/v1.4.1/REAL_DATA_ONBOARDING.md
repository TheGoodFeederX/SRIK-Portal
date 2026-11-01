# REAL_DATA_ONBOARDING — v1.4.1

**Sumber:** `SRIK_PORTAL_IMPLEMENTATION_SPEC_v1.4.1_DATA_ONBOARDING.md`
**Status:** infrastruktur import siap; **import data sebenar belum dijalankan** (menunggu fail sekolah).

---

## 1. Aliran import

```text
Upload .xlsx → Parse → Normalize → Validate → Preview → Resolve → Confirm (transaksi) → Audit → Verify
```

Tiada tulisan ke jadual domain sebelum **Sahkan Import**. Satu sesi = satu transaksi.

## 2. Entiti dan pengenal stabil

| Entiti | Fail templat | Pengenal unik | Nota |
|---|---|---|---|
| Guru & Staf | `SRIK_IMPORT_STAFF.xlsx` | `staff_no` | tiada akaun auth dicipta (§33) |
| Murid | `SRIK_IMPORT_STUDENTS.xlsx` | `student_no` | `gender` + `date_of_birth` wajib untuk murid baharu |
| Kelas | `SRIK_IMPORT_CLASSES.xlsx` | `academic_year + class_name` | guru kelas mesti aktif |
| Subjek | `SRIK_IMPORT_SUBJECTS.xlsx` | `subject_code` (huruf besar) | |
| Keahlian Kelas | `SRIK_IMPORT_ENROLLMENTS.xlsx` | `student_no + academic_year` | konflik kelas ≠ pindah senyap |
| Agihan Pengajaran | `SRIK_IMPORT_ASSIGNMENTS.xlsx` | tahun + guru + kelas + subjek | guru & subjek mesti aktif |

## 3. Status baris

```text
VALID      akan diimport
WARNING    diimport (amaran sahaja)
INVALID    menyekat pengesahan sehingga dibetulkan/dilangkau
DUPLICATE  sudah wujud → dilangkau automatik
CONFLICT   perlukan keputusan ADMIN (Langkau / Ganti kelas)
IMPORTED / SKIPPED  selepas commit
```

## 4. Keselamatan

- Permission `system.data.import` (ADMIN sahaja).
- Fail mentah tidak disimpan pada cakera; hanya `raw_data` baris dalam `import_rows`.
- Tiada URL fail awam; tiada kredensial dalam fail.
- Audit: `import.upload`, `import.validate`, `import.complete`, `import.cancel`.

## 5. Runbook import pertama (belum dijalankan)

```text
1.  Tukar kata laluan ADMIN production melalui /tukar-kata-laluan
2.  Recovery point + dump (scripts/backup.sh)
3.  Muat turun templat SUBJECTS  → isi → import → verify
4.  STAFF        → verify /app/administration/staff
5.  CLASSES      → verify /app/academic/classes
6.  STUDENTS     → verify /app/hem/students
7.  ENROLLMENTS  → verify roster kelas
8.  ASSIGNMENTS  → verify /app/academic/teaching-assignments
9.  Skop guru    → log masuk guru, semak students + Jadual Saya
10. Kehadiran    → ambil kehadiran satu kelas
11. Jadual waktu → period + entri dari agihan
12. Peperiksaan  → exam + subjek + markah + publish
13. Rekod kiraan akhir dalam dokumen ini
```

## 6. Dataset pengesahan minimum (§43)

```text
1 tahun akademik · 2 kelas · 2 guru · 2 subjek · 10+ murid
enrollment aktif · 2+ agihan pengajaran
```

## 7. Status semasa

| Item | Status |
|---|---|
| Infrastruktur import (parser, validate, preview, commit) | ✅ |
| Templat berversi + muat turun | ✅ |
| Pengesanan pendua/konflik | ✅ |
| Commit transaksi + drift detection | ✅ |
| Audit + riwayat import | ✅ |
| Enam entiti disokong | ✅ |
| Ujian (parser, entiti, transaksi) | ✅ 16/16 |
| **Import data sebenar** | ❌ menunggu fail sekolah |
| Pengesahan silang modul dengan data sebenar | ❌ |

Kiraan akhir akan direkod di sini selepas import sebenar dijalankan.
