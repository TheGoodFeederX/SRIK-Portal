# CUTOVER_LOG — v1.1-PROD

> Log kronologi operasi cutover production. Satu baris setiap langkah.
> **Jangan** catat kata laluan, token, cookie, atau connection string.

| # | Masa (UTC) | Langkah | Operator | Keputusan | Rollback? | Nota |
|---|---|---|---|---|---|---|
| 0 | 2026-10-31 | Stage A dibina & diuji pada `dev-auth-v1-1` | agent | PASS | tidak | 3 commit, ujian hijau |
| 1 | 2026-10-31 | PROD-1 Rotate token GitHub/Neon/Vercel | pemilik | DELEGATED | — | pemilik mengesahkan "saya rotate sendiri"; agent menyemak ketiga-tiga token masih aktif pada masa cutover |
| 2 | 2026-10-31 | PROD-2 Recovery point dicipta | agent | PASS | tersedia | branch Neon `rollback-pre-v1.1-prod`; deployment `dpl_74HYPNaA9SDpdyNJDf6Et9gffh3G` |
| 3 | 2026-10-31 | PROD-3 Neon Auth pada branch `main` | agent | PASS | tidak | `better_auth`, nama `Portal SRIK`, domain `srik-portal.vercel.app`, `disable_sign_up: true` |
| 4 | 2026-10-31 | PROD-4 Migration A production (direct connection) | agent | PASS | tidak | `0001_worried_ravenous`; `sessions` + `password_hash` kekal |
| 5 | 2026-10-31 | PROD-5 Admin production dipautkan | agent | PASS | tidak | auth id `105d17d9-…` → profil `7441dfb3-…`, role ADMIN kekal |
| 6 | 2026-10-31 | PROD-6 Env Vercel production | agent | PASS | tidak | +`NEON_AUTH_BASE_URL`, +`VITE_NEON_AUTH_URL`, `CORS_ORIGINS` dikemas; `AUTH_SECRET` dibuang |
| 7 | 2026-10-31 | PROD-7 PR #1 merge + deploy | agent | PASS | tidak | merge `135d8967`, deploy `dpl_22mZR7NWf73QTb3hr6FRobyQVD9m` |
| 8 | 2026-10-31 | PROD-8 Smoke test | agent | PASS | tidak | 38/38 dalam `SMOKE_TEST.md` |
| 9 | 2026-10-31 | PROD-9 Stabilization bermula | agent | PASS | tidak | rujuk `STABILIZATION.md` |
| 10 | 2026-11-01 | R1–R3 provisioning + reset + paksa tukar | agent | PASS | tidak | `POST /users/provision`, `/reset-password`, `PASSWORD_CHANGE_REQUIRED` |
| 11 | 2026-11-01 | R5 backup automatik + restore drill | agent | PASS | tidak | `backup.yml`, dump 72 KB, drill PASS |
| 12 | 2026-11-01 | v1.2 merge + deploy | agent | PASS | tidak | PR #2 merge `ea55ddab`, deploy `dpl_3nvKXh1Ei8ymhcmRyG2cDDcFEqga` |
| 13 | 2026-11-01 | Stage B recovery point | agent | PASS | tersedia | branch `rollback-pre-stage-b-20261101` + dump 76 KB |
| 14 | 2026-11-01 | Stage B destructive migration | agent | PASS | tidak | `0003_remove_legacy_auth`; `sessions`/`password_hash` hilang |
| 15 | 2026-11-01 | Post-Stage-B verification | agent | PASS | tidak | deploy `4ad7f4ec`, 15 semakan dalam `STAGE_B_EXECUTION.md` |

### Nota PROD-5 (kredensial admin)

Spec §27/§28 melarang kata laluan statik pembangunan dalam production. Laluan sebenar ialah
`/lupa-kata-laluan` dengan peti masuk sebenar. Kerana `admin@srik.local` bukan peti masuk sebenar,
agent menetapkan kata laluan sementara melalui aliran Better Auth (hash `scrypt` di bawah
`neon_auth.account`) **semata-mata untuk membuktikan aliran penuh**, dan ia mesti diganti:

```text
TINDAKAN PEMILIK:
1. Tukar emel admin kepada alamat sebenar (atau cipta akaun admin baharu dengan emel sebenar).
2. Guna /lupa-kata-laluan untuk menetapkan kata laluan baharu.
3. Sahkan kata laluan sementara tidak lagi berfungsi.
```

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
