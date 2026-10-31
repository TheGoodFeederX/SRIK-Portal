# BOOTSTRAP_ADMIN — SRIK Portal

Runbook untuk mencipta dan memautkan identiti **Managed Better Auth** kepada profil **ADMIN** SRIK.
Tiada kata laluan kekal direkod dalam dokumen ini atau dalam repo.

---

## 0. Prasyarat

- Akses Neon Console/API untuk projek `srik-portal`.
- Managed Auth telah diaktifkan untuk branch sasaran (lihat `docs/migrations/AUTH_MIGRATION_v1.1.md`).
- `DATABASE_URL` branch tersebut dan `NEON_AUTH_BASE_URL` diketahui.

```bash
# Branch dev semasa (Stage A)
NEON_BRANCH_ID=br-sparkling-king-b3o5hkms
NEON_AUTH_BASE_URL=https://ep-flat-bird-b3z1ffot.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth
```

---

## 1. Sahkan Managed Auth aktif

```bash
curl -s "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$NEON_BRANCH_ID/auth" \
  -H "Authorization: Bearer $NEON_API_KEY"
```

Jangkaan: `auth_provider = better_auth`, `schema_name = neon_auth`, `base_url` dipulangkan.

---

## 2. Cipta identiti auth admin

Guna salah satu:

**A. Managed Auth API (disyorkan untuk bootstrap)**

```bash
curl -s -X POST "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$NEON_BRANCH_ID/auth/users?auth_provider=better_auth" \
  -H "Authorization: Bearer $NEON_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"admin@sekolah.edu.my","name":"Pentadbir SRIK","password":"<kata-laluan-kuat>"}'
```

Respons mengandungi `id` — **inilah auth user id**. Simpan dalam pengurus rahsia, bukan dalam repo.

**B. Aliran pengguna sebenar**

1. Tetapkan kata laluan melalui `POST {NEON_AUTH_BASE_URL}/request-password-reset`.
2. Pengguna membuka pautan emel dan menetapkan kata laluan sendiri.
3. Ambil id pengguna:

```sql
SELECT id, email FROM neon_auth."user" WHERE email = 'admin@sekolah.edu.my';
```

> Development sahaja: jika emel tidak sampai, hash `scrypt` Better Auth boleh ditulis terus
> (`salt_hex:key_hex`, scrypt N=16384 r=16 p=1 dkLen=64). **Jangan** lakukan ini pada production.

---

## 3. Pautkan profil SRIK

```sql
UPDATE profiles
   SET auth_user_id = '<auth-user-id>',
       status = 'ACTIVE',
       password_hash = NULL,
       updated_at = now()
 WHERE email = 'admin@sekolah.edu.my';
```

Jika profil belum wujud:

```sql
INSERT INTO profiles (email, display_name, status, auth_user_id)
VALUES ('admin@sekolah.edu.my', 'Pentadbir SRIK', 'ACTIVE', '<auth-user-id>');

INSERT INTO user_roles (profile_id, role)
SELECT id, 'ADMIN' FROM profiles WHERE auth_user_id = '<auth-user-id>';
```

`profiles.auth_user_id` UNIQUE menjamin satu identiti tidak boleh memaut dua profil.

---

## 4. Sahkan ADMIN berfungsi

```bash
# 1. log masuk (sesi Managed Auth)
curl -s -c ck.txt -X POST "$NEON_AUTH_BASE_URL/sign-in/email" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@sekolah.edu.my","password":"<kata-laluan>"}'

# 2. session aplikasi
curl -s -b ck.txt https://<host>/api/v1/auth/session
#    → state: authenticated-active, roles: ["ADMIN"]

# 3. akses pentadbir
curl -s -b ck.txt https://<host>/api/v1/users
curl -s -b ck.txt https://<host>/api/v1/audit-log
```

Dalam UI: `/app/administration/users` kelihatan, dan `Log Audit` boleh dibuka.

---

## 5. Buang cara bootstrap sementara

- Jangan simpan kata laluan bootstrap dalam repo, `.env`, atau dokumen.
- Jika identiti dicipta dengan kata laluan sementara, minta pemilik menukarnya melalui
  `/lupa-kata-laluan`.
- Pastikan sekurang-kurangnya **dua** ADMIN aktif sebelum operasi sebenar
  (perlindungan `LAST_ADMIN` menghalang penguncian).

---

## 6. Semakan penutup

```text
[ ] auth_provider = better_auth pada branch betul
[ ] profiles.auth_user_id terisi, UNIQUE
[ ] user_roles ADMIN wujud
[ ] /api/v1/auth/session → authenticated-active
[ ] /api/v1/users boleh diakses
[ ] identiti tanpa jemputan → APP_PROFILE_NOT_LINKED
[ ] tiada kata laluan direkod dalam repo/dokumen
```
