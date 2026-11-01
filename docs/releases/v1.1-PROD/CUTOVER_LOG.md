# CUTOVER_LOG — v1.1-PROD

> Log kronologi operasi cutover production. Satu baris setiap langkah.
> **Jangan** catat kata laluan, token, cookie, atau connection string.

| # | Masa (UTC) | Langkah | Operator | Keputusan | Rollback? | Nota |
|---|---|---|---|---|---|---|
| 0 | 2026-10-31 | Stage A dibina & diuji pada `dev-auth-v1-1` | agent | PASS | tidak | 3 commit, ujian hijau |
| 1 | — | PROD-1 Rotate token GitHub/Neon/Vercel | pemilik | — | — | menunggu |
| 2 | — | PROD-2 Recovery point dicipta | — | — | — | — |
| 3 | — | PROD-3 Neon Auth pada branch `main` | — | — | — | — |
| 4 | — | PROD-4 Migration A production | — | — | — | — |
| 5 | — | PROD-5 Admin production dipautkan | — | — | — | — |
| 6 | — | PROD-6 Env Vercel production | — | — | — | — |
| 7 | — | PROD-7 PR merge + deploy | — | — | — | — |
| 8 | — | PROD-8 Smoke test | — | — | — | lihat `SMOKE_TEST.md` |
| 9 | — | PROD-9 Stabilization bermula | — | — | — | lihat `STABILIZATION.md` |

---

## Templat entri

```text
Masa :
Langkah :
Operator :
Perintah/bukti :
Keputusan : PASS / FAIL / BLOCKED
Rollback diperlukan : ya / tidak
Nota :
```

## Kriteria berhenti segera (§50)

```text
admin tidak boleh authenticate
semua pengguna terkunci
pemetaan identiti rosak
record scope melebar tanpa disengajakan
pengguna tidak sah mendapat akses
ketidakstabilan sesi menghalang penggunaan biasa
migration merosakkan data teras
kadar 5xx tinggi selepas deploy
```

Jika mana-mana berlaku: hentikan rollout, ikut §51 (`RELEASE_PLAN.md` §6), rekod dalam log ini.

---

## Pra-cutover (PROD-0 sahaja)

| # | Masa (UTC) | Langkah | Operator | Keputusan | Rollback? | Nota |
|---|---|---|---|---|---|---|
| 0.1 | 2026-10-31 16:36 | Branch `feature/neon-auth-v1-1` dipush | agent | PASS | tidak | Stage A + 2 commit gate |
| 0.2 | 2026-10-31 16:38 | CI pertama pada PR | agent | FAIL | tidak | audit gate: drizzle-orm + zod `high` |
| 0.3 | 2026-10-31 16:5x | Naik taraf drizzle-orm 0.45.4, drizzle-kit 0.31.11, zod 4.6.7 | agent | PASS | tidak | ujian tempatan hijau selepas penyesuaian |
| 0.4 | 2026-10-31 16:5x | CI kedua pada PR #1 (`3d375892`) | agent | PASS | tidak | semua gate lulus |
| 0.5 | 2026-10-31 | Token GitHub/Neon/Vercel disemak | agent | BLOCKED | tidak | ketiga-tiga masih aktif → PROD-1 belum |
