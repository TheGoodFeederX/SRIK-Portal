# AUDIT_EXCEPTIONS — dependency audit allowlist

CI (`scripts/audit-gate.mjs`) gagal pada advisory **critical**: semua.
Pada **high**: semua, melainkan ID disenaraikan di bawah (spec v1.1-PROD §19, spec v1.1 §90).

Tiada pengecualian aktif.

| Advisory | Pakej | Sebab | Tarikh luput |
|---|---|---|---|
| — | — | — | — |

## Nota

- `moderate` dilaporkan tetapi tidak menggagalkan CI (`esbuild` dev-server advisory, GHSA-67mh-4wv8-2f99 — hanya berkaitan `vite dev`, tidak wujud dalam production build).
- Sebelum menambah pengecualian: rekod sebab, tarikh luput, dan pemilik.
