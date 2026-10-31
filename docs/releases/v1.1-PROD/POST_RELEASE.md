# POST_RELEASE — v1.1-PROD

> Item susulan selepas cutover. Setiap satu ialah tiket berasingan, bukan sebahagian PR cutover.

| ID | Item | Keutamaan | Nota |
|---|---|---|---|
| POST-PROD-EMAIL | Sender/e-mel berjenama sekolah (§68) | Tinggi sebelum roll-out penuh | provider `shared` Neon hanya untuk rollout terkawal |
| POST-PROD-CSP | Enforce Content-Security-Policy (§69) | Tinggi selepas origin auth diketahui | perlu inventori origin `*.neonauth.*` + ujian |
| POST-PROD-OBS | Sentry frontend + API (§70) | Sederhana | `requestId` + versi release; tiada data murid sensitif |
| POST-PROD-BACKUP | Backup automatik + restore drill berjadual (§71) | **Tinggi sebelum data sebenar** | manual sekali sahaja tidak cukup |
| POST-PROD-RATELIMIT | Limiter teragih / edge (§67) | Rendah untuk MVP | had semasa: in-memory per-instance |
| POST-PROD-UIRESEND | Butang "Hantar semula jemputan" dalam jadual Pengguna | Rendah | API sudah ada; UI perlukan id jemputan per baris |
| POST-PROD-STAGEB | Stage B legacy removal (§56–§65) | Selepas stabilization + kelulusan | lihat `STAGE_B_APPROVAL.md` |

---

## Susulan spec seterusnya (§84, §108 v1.1)

```text
Implementation Spec v1.2 — Academic Foundation
  Subjects → Teaching Assignments → Enrollment/Class Management
  → Timetable → Examination → Report Card
```

Jangan mula timetable sebelum asas subjek + agihan pengajaran stabil.

---

## Templat penutup release

```text
Versi release   : v1.1-PROD (Stage A)
Tarikh deploy   : —
Deployment ID   : —
SHA             : —
Smoke test      : PASS / FAIL (SMOKE_TEST.md)
Rollback        : tidak diperlukan / berlaku
Susulan dibuka  : POST-PROD-EMAIL, POST-PROD-CSP, POST-PROD-OBS, POST-PROD-BACKUP
```
