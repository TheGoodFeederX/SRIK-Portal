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
