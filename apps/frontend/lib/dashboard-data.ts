/**
 * Bentuk data dan pemanggil endpoint untuk halaman dashboard.
 *
 * ## Bentuknya dibaca dari backend, bukan dari nama endpoint
 *
 * Setiap type di bawah adalah salinan interface di `apps/backend/src`, bukan
 * tebakan dari URL:
 *
 * - `StoreSummary` <- `stores/store-access.service.ts` (`GET /stores`)
 * - `StoreMemberView` <- `stores/stores.service.ts` (`GET /stores/:storeId/members`)
 * - `AdminUserView` <- `admin/admin.service.ts` (`GET /admin/users`, `PATCH /admin/users/:userId/status`)
 * - `AdminStoreView` <- `admin/admin.service.ts` (`GET /admin/stores`)
 * - `StoreView` <- `stores/stores.service.ts` (`PATCH /stores/:storeId`)
 *
 * Kalau bentuknya berubah di backend, bagian yang salah compile di sini -
 * bukan UI yang diam-diam menampilkan `undefined`.
 *
 * ## Kenapa semua pemanggil lewat `sessionRequest`
 *
 * `apiRequest` tidak tahu apa-apa soal sesi, dan R-41 butuh penyambungan
 * refresh di setiap request dashboard. `sessionRequest` di
 * `lib/session-refresh.ts` adalah lapisan itu, dan semua pemanggil di file
 * ini memakainya. Tidak ada satu pun fetch langsung ke backend yang keluar
 * dari titik ini - kalau nanti ada, berarti ada jalur yang R-41 bisa terlewat.
 *
 * ## Kenapa tidak ada paginasi di UI
 *
 * `GET /admin/users` dan `GET /admin/stores` mengembalikan
 * `{ data, meta }`, dan `apiRequest` sengaja membuang amplopnya sehingga
 * hanya `data` yang terlihat._memakai `pageSize` maksimum (100) dan
 * menampilkan apa adanya yang diterima, dengan catatan jujur kalau barisnya
 * penuh. Menambah sumber kebenaran kedua tentang total - dengan membaca
 * `meta` lewat jalur fetch kedua - berarti mengulang parser envelope
 * `api-client.ts`, dan salinan itu tempat paling rawan menjadi berbeda
 * diam-diam.
 */

import { sessionRequest } from "./session-refresh";

export type StoreRole = "OWNER" | "STAFF";

/** Peran user di suatu toko, sesuai `StoreMemberRole` backend. */
export type IssuedInvitation = {
  id: string;
  email: string;
  role: StoreRole;
  expiresAt: string;
  token: string;
};

/** Ringkasan undangan yang aman ditampilkan di halaman publik. */
export type InvitationPreview = {
  email: string;
  storeName: string;
  role: StoreRole;
  expiresAt: string;
};

/** Hasil menerima undangan. */
export type AcceptedInvitation = {
  storeId: string;
  storeName: string;
  role: StoreRole;
};

export type NotificationSeverity = "info" | "warning" | "success" | "error";

export type NotificationItem = {
  id: string;
  storeId: string | null;
  type: string;
  title: string;
  body: string | null;
  severity: NotificationSeverity;
  readAt: string | null;
  createdAt: string;
};

/** `StoreStatus` di backend. */
export type StoreStatus = "ACTIVE" | "SUSPENDED";

/** Satu toko milik user, dengan peran user di toko itu. */
export type StoreSummary = {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
  /** Peran user DI TOKO INI, bukan peran platform-nya. */
  role: StoreRole;
};

/** Detail toko tanpa peran - hasil `PATCH /stores/:storeId`. */
export type StoreView = {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
};

/** Toko + peran PEMBUAT-nya - hasil `POST /stores`. */
export type CreatedStore = StoreView & { role: StoreRole };

/** Satu anggota toko beserta user-nya. */
export type StoreMember = {
  userId: string;
  role: StoreRole;
  joinedAt: string;
  user: { id: string; email: string; name: string; role: string };
};

/** Satu baris daftar pengguna milik admin. */
export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

/** Satu baris daftar toko seluruh platform. */
export type AdminStore = {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
  createdById: string;
  createdAt: string;
};

/**
 * Batas `pageSize` di backend (`PageQueryDto`).
 *
 * Dikirim eksplisit karena `meta` tidak dipakai: membaca "halaman 1" tanpa
 * mengatakan berapa barisnya sama denganreadsheet yang diam-diam dipotong.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * `GET /stores` - toko yang bisa diakses user.
 *
 * Daftar ini berasal dari keanggotaan milik user itu sendiri, bukan dari
 * parameter apa pun yang dikirim klien, jadi tidak ada `storeId` yang bisa
 * dicoba untuk menyasar toko orang lain.
 */
export function listAccessibleStores(): Promise<StoreSummary[]> {
  return sessionRequest<StoreSummary[]>("/stores");
}

/**
 * `POST /stores` - buat toko baru; pemanggil otomatis jadi OWNER.
 *
 * `city` dikirim hanya kalau ada isinya, bukan sebagai `undefined`: body JSON
 * dengan `city: undefined` tetap ikut kalau diserialisasi oleh pemanggil lain,
 * sedangkan `CreateStoreDto` menolak field yang bukan string. Memilih bentuk
 * body di sini membuat kontraknya satu tempat.
 */
export function createStore(input: {
  name: string;
  city?: string;
}): Promise<CreatedStore> {
  const body =
    input.city === undefined
      ? { name: input.name }
      : { name: input.name, city: input.city };

  return sessionRequest<CreatedStore>("/stores", { method: "POST", body });
}

/**
 * `GET /stores/:storeId/members`.
 *
 * `storeId` selalu datang dari data yang baru saja dibaca backend - bukan
 * dari query string - dan tetap di-`encodeURIComponent` karena ia masuk URL.
 */
export function listStoreMembers(storeId: string): Promise<StoreMember[]> {
  return sessionRequest<StoreMember[]>(
    `/stores/${encodeURIComponent(storeId)}/members`,
  );
}

/**
 * `PATCH /stores/:storeId` - ubah nama dan kota.
 *
 * Hanya tersedia bagi OWNER toko itu; backend menjawab
 * `INSUFFICIENT_ROLE` (403) untuk STAFF. Tombolnya tidak dirender untuk
 * STAFF, dan jawaban backend tetap yang berlaku terakhir kalau token
 * dipalsukan atau peran berubah di tengah sesi.
 */
export function updateStore(
  storeId: string,
  input: { name: string; city: string },
): Promise<StoreView> {
  return sessionRequest<StoreView>(`/stores/${encodeURIComponent(storeId)}`, {
    method: "PATCH",
    body: input,
  });
}

/**
 * `POST /stores/:storeId/invitations` - terbitkan undangan pegawai.
 *
 * Hanya OWNER toko yang boleh memanggilnya (backend `@Roles + @StoreAccess`).
 * Token mentah yang dikembalikan muncul SATU KALI; simpan lalu kirim lewat
 * email/out-of-band, karena berikutnya yang tercatat hanya digest-nya.
 */
export function inviteMember(
  storeId: string,
  input: { email: string; role: StoreRole },
): Promise<IssuedInvitation> {
  return sessionRequest<IssuedInvitation>(
    `/stores/${encodeURIComponent(storeId)}/invitations`,
    { method: "POST", body: input },
  );
}

/**
 * `GET /invitations/:token` (publik) - ringkasan undangan sebelum diterima.
 */
export function previewInvitation(token: string): Promise<InvitationPreview> {
  return sessionRequest<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`);
}

/**
 * `POST /invitations/:token/accept` (auth) - terima undangan dan jadi anggota.
 */
export function acceptInvitation(token: string): Promise<AcceptedInvitation> {
  return sessionRequest<AcceptedInvitation>(
    `/invitations/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );
}

/** `GET /admin/users` - khusus ADMIN. */
export function listAdminUsers(): Promise<AdminUser[]> {
  return sessionRequest<AdminUser[]>(`/admin/users?page=1&pageSize=${MAX_PAGE_SIZE}`);
}

/**
 * `PATCH /admin/users/:userId/status`.
 *
 * `userId` di path adalah TARGET, pelaku selalu backend yang ambil dari
 * token. `isActive` wajib dikirim eksplisit - `UpdateUserStatusDto` tidak
 * punya default, jadi body's yang kosong ditolak `VALIDATION_ERROR`.
 */
export function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<AdminUser> {
  return sessionRequest<AdminUser>(
    `/admin/users/${encodeURIComponent(userId)}/status`,
    { method: "PATCH", body: { isActive } },
  );
}

/** `GET /admin/stores` - khusus ADMIN. */
export function listAdminStores(): Promise<AdminStore[]> {
  return sessionRequest<AdminStore[]>(`/admin/stores?page=1&pageSize=${MAX_PAGE_SIZE}`);
}

/** `GET /admin/ml-jobs` - monitor job ML lintas toko (ADMIN). */
export function listAdminMlJobs(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<
  Array<{
    id: string;
    storeId: string | null;
    jobType: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
  }>
> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));
  const suffix = query.toString();
  return sessionRequest(
    `/admin/ml-jobs${suffix ? `?${suffix}` : ""}`,
  );
}

/** `GET /admin/ml-models` - status ML service/model (ADMIN). */
export function adminMlModels(): Promise<unknown> {
  return sessionRequest("/admin/ml-models");
}

/**
 * `GET /notifications` - notifikasi pengguna, dengan filter toko/status/paging.
 */
export function listNotifications(params?: {
  storeId?: string;
  status?: "all" | "unread" | "read";
  limit?: number;
  offset?: number;
}): Promise<NotificationItem[]> {
  const query = new URLSearchParams();
  if (params?.storeId) query.set("storeId", params.storeId);
  if (params?.status && params.status !== "all") query.set("status", params.status);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));

  const suffix = query.toString();
  return sessionRequest<NotificationItem[]>(
    `/notifications${suffix ? `?${suffix}` : ""}`,
  );
}

/** `GET /notifications/unread-count`. */
export function unreadNotificationCount(storeId?: string): Promise<number> {
  const query = new URLSearchParams();
  if (storeId) query.set("storeId", storeId);
  const suffix = query.toString();
  return sessionRequest<{ count: number }>(
    `/notifications/unread-count${suffix ? `?${suffix}` : ""}`,
  ).then((result) => result.count);
}

/** `PATCH /notifications/:id/read`. */
export function markNotificationRead(id: string): Promise<NotificationItem> {
  return sessionRequest<NotificationItem>(
    `/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH" },
  );
}

/** `POST /notifications/read-all`. */
export function markAllNotificationsRead(storeId?: string): Promise<number> {
  const query = new URLSearchParams();
  if (storeId) query.set("storeId", storeId);
  const suffix = query.toString();
  return sessionRequest<{ updated: number }>(
    `/notifications/read-all${suffix ? `?${suffix}` : ""}`,
    { method: "POST" },
  ).then((result) => result.updated);
}