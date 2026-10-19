/**
 * Menu navigasi per peran, sebagai data murni.
 *
 * ## Kenapa modul ini terpisah dari komponen
 *
 * Isinya adalah KEPUTUSAN ("peran ini boleh melihat apa"), bukan tampilan.
 * Memisahkannya berarti keputusan itu bisa diuji sebagai fungsi murni tanpa
 * merender apa pun - dan lebih penting, menu tidak bisa berubah diam-diam
 * karena ada `if` yang tersembunyi di dalam JSX.
 *
 * ## R-39: menu yang disembunyikan itu UX, bukan keamanan
 *
 * `navForRole` menentukan apa yang TERLIHAT. Yang menentukan apa yang bisa
 * dibaca adalah `@Roles(...)` di backend, dan itu yang diujiTask 9 wajib -
 * buka `/dashboard/admin/users` langsung lewat URL harus dijawab 403
 * `FORBIDDEN_ROLE` oleh backend, bukan oleh redirect frontend. Kalau satu saat
 * menu ini berubah jadi satu-satunya penjaga, setiap item `href: null` di
 * bawah berubah dari "fitur belum ada" jadi "lubang".
 *
 * Karena itu `href: null` berarti **halaman belum ada di fase ini**, dan
 * item-nya dirender sebagai teks mati dengan alasannya - bukan sebagai link
 * yang menuju 404, dan bukan sebagai tombol yang tidak melakukan apa pun.
 */

import type { Route } from "next";

/** Peran platform. Sumbernya: enum `Role` di `apps/backend`. */
export const PLATFORM_ROLES = ["ADMIN", "OWNER", "STAFF"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * Peran sebagai string, atau `null` kalau di luar enum.
 *
 * Default-nya `null`, bukan `OWNER`: peran yang tidak dikenal harus terlihat
 * sebagai "tidak ada menu yang bisa dipercaya", bukan mendapat halaman
 * milik peran lain.
 */
export function toPlatformRole(raw: unknown): PlatformRole | null {
  return typeof raw === "string" && (PLATFORM_ROLES as readonly string[]).includes(raw)
    ? (raw as PlatformRole)
    : null;
}

export type NavItem = {
  /** Kunci stabil, dipakai sebagai `key` dan untuk pengujian. */
  key: string;
  label: string;
  /**
   * Tujuan navigasi, atau `null` kalau halamannya belum ada.
   *
   * `null` bukan "sembunyikan": item-nya tetap tampil dengan penjelasan, agar
   * pengguna tahu fitur itu direncanakan dan bukan salah jalan.
   */
  href: Route | null;
  /** Alasan tampil sebagai teks mati. Wajib kalau `href` null. */
  unavailableReason?: string;
  /** Tepat sama dengan `href`, bukan juga semua turunannya. */
  exact?: boolean;
};

/** Profil minimum yang dibutuhkan untuk menentukan menu. */
export type NavProfile = {
  role: string;
  stores: readonly { role: string }[];
};

/**
 * Peran menu yang diturunkan dari KEPEMILIKAN TOKO, bukan peran platform.
 *
 * `Role.STAFF` di backend praktis tidak pernah dipakai: pendaftar mandiri
 * selalu `OWNER` di platform, dan pegawai masuk lewat undangan yang hanya
 * menambah membership. Jadi kalau menu memakai peran platform, pegawai yang
 * menerima undangan akan melihat menu Pemilik. Sumber yang benar adalah
 * membership toko.
 *
 * Peran platform `ADMIN` tetap menang karena admin tidak terikat toko. User
 * yang sama sekali belum punya toko dianggap OWNER - justru supaya halaman
 * "buat toko" tetap terlihat dan dia tidak mentok di dashboard kosong.
 */
export function deriveNavRole(profile: NavProfile | null): PlatformRole | null {
  if (profile === null) return null;

  const platform = toPlatformRole(profile.role);
  if (platform === null) return null;
  if (platform === "ADMIN") return "ADMIN";

  if (profile.stores.length === 0) return "OWNER";

  return profile.stores.some((store) => store.role === "OWNER") ? "OWNER" : "STAFF";
}

/**
 * Halaman depan `/dashboard` untuk sebuah peran.
 *
 * Hanya ADMIN yang diarahkan ke area admin. Peran lain - termasuk yang tidak
 * dikenal - diarahkan ke toko, karena itu satu-satunya halaman yang selalu
 * ada dan tidak butuh backend yang menolak perannya.
 */
export function defaultDashboardPath(role: PlatformRole | null): Route {
  return role === "ADMIN" ? "/dashboard/admin" : "/dashboard/toko";
}

/**
 * Menu ADMIN.
 *
 * Monitoring dan Audit Log belum punya endpoint di backend, jadi keduanya
 * `href: null` dengan alasan yang jujur - bukan link ke halaman kosong dan
 * bukan angka monitoring yang dikarang.
 */
const ADMIN_NAV: readonly NavItem[] = [
  { key: "admin-ringkasan", label: "Ringkasan platform", href: "/dashboard/admin", exact: true },
  { key: "admin-toko", label: "Toko", href: "/dashboard/admin/stores" },
  { key: "admin-pengguna", label: "Pengguna", href: "/dashboard/admin/users" },
  { key: "admin-notifikasi", label: "Notifikasi", href: "/dashboard/notifikasi" },
  {
    key: "admin-monitoring",
    label: "Monitoring",
    href: "/dashboard/admin/monitoring",
  },
  {
    key: "admin-audit",
    label: "Audit Log",
    href: null,
    unavailableReason:
      "Jejak audit sudah tercatat di backend, tetapi belum ada endpoint untuk membacanya per admin.",
  },
];

/**
 * Menu OWNER toko.
 *
 * Semua halaman ini berbasis data tenant, jadi href-nya menunjuk ke halaman
 * nyata dan bukan teks mati. Yang menentukan apakah isinya terisi adalah data
 * toko, bukan peran.
 */
const OWNER_NAV: readonly NavItem[] = [
  { key: "toko-ringkasan", label: "Ringkasan toko", href: "/dashboard/analytics" },
  { key: "analisis-ml", label: "Analisis ML", href: "/dashboard/analytics-jobs" },
  { key: "data", label: "Data penjualan", href: "/dashboard/data" },
  { key: "pesanan", label: "Pesanan", href: "/dashboard/orders" },
  { key: "katalog", label: "Katalog", href: "/dashboard/catalog" },
  { key: "laporan", label: "Laporan", href: "/dashboard/reports" },
  { key: "toko-dan-tim", label: "Toko & Tim", href: "/dashboard/toko" },
  { key: "notifikasi", label: "Notifikasi", href: "/dashboard/notifikasi" },
  { key: "profil", label: "Profil", href: "/dashboard/profil" },
];

/**
 * Menu STAFF.
 *
 * Tidak ada item admin, dan tidak ada halaman yang butuh kendali pemilik:
 * katalog dan unggah data hanya untuk OWNER. Perbedaannya dari OWNER bukan
 * label saja - halaman yang tersisa memang tidak menyediakan kontrol mutasi
 * katalog, jadi menu tidak menjanjikan sesuatu yang halaman tidak lakukan.
 */
const STAFF_NAV: readonly NavItem[] = [
  { key: "toko-ringkasan", label: "Ringkasan toko (hanya baca)", href: "/dashboard/analytics" },
  { key: "pesanan", label: "Pesanan", href: "/dashboard/orders" },
  { key: "laporan", label: "Laporan (hanya baca)", href: "/dashboard/reports" },
  { key: "toko", label: "Toko (hanya baca)", href: "/dashboard/toko" },
  { key: "notifikasi", label: "Notifikasi", href: "/dashboard/notifikasi" },
  { key: "profil", label: "Profil", href: "/dashboard/profil" },
];

const NAV_BY_ROLE: Record<PlatformRole, readonly NavItem[]> = {
  ADMIN: ADMIN_NAV,
  OWNER: OWNER_NAV,
  STAFF: STAFF_NAV,
};

/**
 * Menu untuk sebuah peran. Peran `null` menghasilkan menu kosong, bukan menu
 * milik peran lain.
 */
export function navForRole(role: PlatformRole | null): readonly NavItem[] {
  if (role === null) return [];
  return NAV_BY_ROLE[role];
}

/** Item menu yang punya tujuan navigasi saja (tanpa yang `href: null`). */
export function navigableNavItems(role: PlatformRole | null): readonly NavItem[] {
  return navForRole(role).filter((item) => item.href !== null);
}

/**
 * Apakah `storeId` boleh dimutasi oleh user berdasarkan daftar toko yang dia
 * miliki. Sumber kebenaran backend tetap @StoreAccess; ini hanya UX.
 */
export function canManageStore(
  stores: readonly { id: string; role: string }[] | null | undefined,
  storeId: string | null,
): boolean {
  if (storeId === null || stores == null) return false;
  return stores.some((store) => store.id === storeId && store.role === "OWNER");
}