# RECOVERY_POINT — v1.1-PROD

> Rekod keadaan production sebelum cutover. Kemas kini semasa PROD-2. **Tiada kredensial di sini.**

---

## Pra-cutover (PROD-2, 2026-10-31)

| Item | Nilai |
|---|---|
| Tarikh/masa (UTC) | 2026-10-31 |
| Git `main` SHA | `07086134` |
| Vercel deployment ID (production) | `dpl_74HYPNaA9SDpdyNJDf6Et9gffh3G` |
| Vercel deployment URL | `https://srik-portal-qxj8wpa2g-thegoodfeederxs-projects.vercel.app` |
| Alias production | `https://srik-portal.vercel.app` |
| Deployment terdahulu (fallback) | `dpl_DK6AFLfJfmXykoQu228akukQ9rdp` (`b711ad1c`) |
| Neon branch (production) | `br-mute-sun-b3t283ay` (`main`) |
| Neon endpoint | `ep-dry-sunset-b3scjaeb` (pooled) |
| Migration journal | `0000_broad_moon_knight` sahaja |
| Recovery branch (Neon) | `br-noisy-base-b3iqq2ey` (`rollback-pre-v1.1-prod`) — salinan `main` sebelum Migration A |
| Operator | agent (arahan pemilik: "Luluskan penuh termasuk merge + deploy production") |
| Keadaan disahkan | `GET /api/v1/health` → 200; `POST /api/v1/auth/login` → 400 (legacy aktif) |

### Pengesahan rollback

```text
Vercel → Promotions → dpl_74HYPNaA9SDpdyNJDf6Et9gffh3G
Neon   → branch rollback-pre-v1.1-prod (br-noisy-base-b3iqq2ey)
         DATABASE_URL = <definisi pooler branch tersebut>
```
