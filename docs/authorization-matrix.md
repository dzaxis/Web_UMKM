# Matrix Otorisasi

| Role Platform | Area | Akses |
|---|---|---|
| ADMIN | `/admin/*` | baca lintas tenant (directory) |
| OWNER/STAFF | `/stores/:storeId/*` | hanya store membership |
| OWNER | ingest, recompute | ya |
| STAFF | ingest harian, baca analytics/laporan | upload/mapping/validate/commit dataset, input order manual |

## Peran toko vs peran platform

`@Roles(...)` memeriksa **peran platform** (`users.role`). Semua pendaftar baru
adalah platform `OWNER`, termasuk orang yang kemudian diundang sebagai pegawai.
Karena itu setiap endpoint tulis toko wajib memakai **peran keanggotaan toko**:

```ts
@StoreAccess("OWNER")
```

bukan `@StoreAccess()` saja. Tanpa ini, pegawai yang diundang tetap lolos
`@Roles(Role.OWNER)` karena peran platform-nya OWNER.

## Batas STAFF (ditegakkan server-side)

STAFF **boleh**:

- membaca dashboard, analitik, laporan, produk, pelanggan, supplier;
- upload dataset harian, mengatur mapping, validasi, dan commit;
- mencatat order manual.

STAFF **tidak boleh**:

- menjalankan analisis/training ML (`POST /analytics/run`, `POST /forecast/compute`);
- mengubah katalog (produk, kategori, margin, supplier);
- mengubah data pelanggan;
- rollback dataset yang sudah diproses;
- mengekspor pelanggan per segmen;
- mengelola anggota/undangan, kepemilikan, atau konfigurasi toko.

ADMIN platform tetap harus menjadi anggota toko (atau memakai route `/admin/*`)
untuk mengakses data tenant; ADMIN bukan bypass tenant.

## Guard chain

`JwtAuthGuard` -> `RolesGuard` -> `StoreScopeGuard`.

Tenant scope middleware hanya `storeMembers`, `storeInvites`.
MCP tools selalu memerlukan `accessToken` + `storeId`.
