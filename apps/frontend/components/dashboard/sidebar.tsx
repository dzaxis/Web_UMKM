"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Badge, Button, Skeleton } from "@/components/ui";

import { deriveNavRole, navForRole } from "@/lib/dashboard-nav";
import type { NavItem } from "@/lib/dashboard-nav";

import { useSession } from "./session-provider";

/**
 * Sidebar dashboard, dengan menu per peran.
 *
 * ## Yang terjadi ketika profil belum selesai dimuat
 *
 * Menu disembunyikan dan diganti skeleton. Alternatifnya - merender menu
 * ADMIN sebagai tebakan lalu menukarnya begitu profil tiba - sempat
 * dipertimbangkan, dan ditolak: kedipan itu terjadi pada setiap muat halaman,
 * dan teks "Menu hanya untuk admin" yang muncul lalu hilang adalah informasi
 * yang salah walaupun hanya sesaat.
 */

/** Label peran untuk ditampilkan. */
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  OWNER: "Pemilik toko",
  STAFF: "Pegawai",
};

export function Sidebar() {
  const pathname = usePathname();
  const { status, profile, logout } = useSession();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const role = deriveNavRole(profile);
  const items = navForRole(role);

  async function handleLogout(): Promise<void> {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // `logout()` sudah membersihkan cookie lokal apa pun yang bisa. Kalau
      // network gagal, pengguna tetap boleh keluar - Staying in the dashboard
      // setelah menekan "Keluar" adalah hasil yang lebih buruk.
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6 border-b border-line bg-surface px-5 py-4 lg:h-full lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
      <div className="flex items-center justify-between gap-3 lg:block">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-md bg-navy text-sm font-bold text-accent"
          >
            BI
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            BisnisInsight
          </span>
        </Link>
        <div className="lg:hidden">
          <UserBadge name={profile?.name} roleLabel={ROLE_LABELS[role ?? ""]} />
        </div>
      </div>

      <nav aria-label="Menu dashboard" className="flex-1">
        {status === "loading" ? (
          <NavSkeleton />
        ) : (
          <ul className="flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
            {items.map((item) => (
              <li key={item.key}>
                <NavLink item={item} pathname={pathname} />
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="hidden items-center justify-between gap-3 border-t border-line pt-4 lg:flex">
        <UserBadge name={profile?.name} roleLabel={ROLE_LABELS[role ?? ""]} />
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={loggingOut || status !== "ready"}
        >
          {loggingOut ? "Keluar..." : "Keluar"}
        </Button>
      </div>

      <div className="lg:hidden">
        <Button
          variant="outline"
          size="sm"
          fullWidth
          onClick={handleLogout}
          disabled={loggingOut || status !== "ready"}
        >
          {loggingOut ? "Keluar..." : "Keluar"}
        </Button>
      </div>
    </div>
  );
}

function UserBadge({ name, roleLabel }: { name?: string; roleLabel?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium text-ink">
        {name ?? "Memuat..."}
      </span>
      {roleLabel ? (
        <span className="text-xs text-ink-muted">{roleLabel}</span>
      ) : null}
    </div>
  );
}

/**
 * Satu item menu.
 *
 * `href: null` dirender sebagai `<span>`, bukan `<Link>` dan bukan `<button>`.
 *syarat. Item dengan `href: null` berarti halamannya belum ada,
 * dan satu-satunya cara jujur mengatakannya adalah dengan tidak membuatnya
 * bisa diklik.
 */
function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  if (item.href === null) {
    return (
      <span
        title={item.unavailableReason}
        className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-ink-faint"
      >
        <span>{item.label}</span>
        <Badge variant="neutral" size="sm">
          Segera
        </Badge>
      </span>
    );
  }

  const isActive = item.exact === true
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "flex items-center rounded-lg bg-neutral-wash px-3 py-2 text-sm font-medium text-navy"
          : "flex items-center rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-neutral-wash hover:text-ink"
      }
    >
      {item.label}
    </Link>
  );
}

function NavSkeleton() {
  return (
    <div className="flex flex-col gap-2 lg:gap-1" aria-hidden="true">
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-9 w-2/3 rounded-lg" />
    </div>
  );
}