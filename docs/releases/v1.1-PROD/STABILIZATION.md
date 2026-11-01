# STABILIZATION — v1.1-PROD

> Tempoh pemerhatian selepas cutover (§53, §54). **Stage B dilarang** sepanjang tempoh ini.

**Mula:** 2026-10-31 (selepas deploy `dpl_22mZR7NWf73QTb3hr6FRobyQVD9m`)
**Tamat (cadangan minimum):** 14 hari penggunaan sebenar ATAU 30 hari kalendar, mana lebih awal

---

## Semakan berulang (§54)

| Item | Kekerapan | Kaedah | Status |
|---|---|---|---|
| Login berjaya | harian | manual + log audit | ☐ |
| Login gagal (kadar) | harian | log Managed Auth | ☐ |
| Penghantaran reset kata laluan | harian | e-mel | ☐ |
| Kesinambungan sesi | harian | reload/navigasi | ☐ |
| Penerimaan jemputan | setiap kes | `/audit-log` | ☐ |
| Kebenaran guru | setiap kes | smoke §5 | ☐ |
| Kelakuan rate limit | mingguan | 429 terkawal | ☐ |
| Corak 401/403 | harian | log API | ☐ |
| Kadar 5xx | harian | Vercel logs | ☐ |
| Peristiwa audit | harian | `/audit-log` | ☐ |
| Penghantaran e-mel | mingguan | ujian reset | ☐ |

---

## Kriteria untuk mencadangkan Stage B (§55)

```text
[ ] cutover production diterima
[ ] admin mempunyai akses auth stabil
[ ] sekurang-kurangnya satu aliran onboarding guru disahkan
[ ] reset kata laluan disahkan
[ ] tiada rollback diperlukan
[ ] regresi record scope disahkan
[ ] backup/recovery masih tersedia
[ ] pemilik meluluskan pembersihan destruktif
```

Kegagalan mana-mana item → **tiada Stage B**.

---

## Log insiden

| Tarikh | Insiden | Kesan | Tindakan | Status |
|---|---|---|---|---|
| — | — | — | — | — |
