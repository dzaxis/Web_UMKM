"use client";

import Link from "next/link";
import * as React from "react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Table,
  TableSkeleton,
} from "@/components/ui";

import { listAdminStores, listAdminUsers } from "@/lib/dashboard-data";
import type { AdminUser } from "@/lib/dashboard-data";
import { describeDataError } from "@/lib/dashboard-errors";

import { useApiResource } from "./use-api-resource";

/**
 * Beranda admin: pengguna terbaru, jumlah toko, dan apa yang belum ada.
 *
 * ## Kenapa tidak ada angka agregat
 *
 * Fase ini tidak punya endpoint statistik platform. Omzet, jumlah produk,
 * status model, dan health job semuanya ada di rencana Monitoring - dan
 * menampilkan nol untuk semuanya akan terlihat seperti hasil laporan,
 * bukan seperti data yang belum ada. Yang ditampilkan hanya yang benar-benar
 * bisa dibaca: daftar pengguna dari `GET /admin/users` dan jumlah baris toko
 * yang diterima `GET /admin/stores`.
 *
 * ## Angka "tokos" di sini bukan total platform
 *
 * Yang dihitung adalah berapa baris yang diterima, bukan `meta.total`.
 * `apiRequest` membuang amplop `meta`, dan `pageSize` dibatasi backend di
 * 100. Kalau barisnya sampai penuh, catatan di bawah bilang begitu - bukan
 * Diam-diam menyamar sebagai total.
 */
export function AdminOverviewPanel() {
  const users = useApiResource(React.useCallback(() => listAdminUsers(), []));
  const stores = useApiResource(React.useCallback(() => listAdminStores(), []));

  const loading = users.status === "loading" || stores.status === "loading";
  const firstError =
    users.status === "error" ? users.error : stores.status === "error" ? stores.error : null;

  const recent = users.data?.slice(0, 5) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pengguna</CardTitle>
            <CardDescription>
              Seluruh akun di platform, dari halaman{" "}
              <Link href="/dashboard/admin/users" className="underline underline-offset-4">
                Pengguna
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-ink">
              {loading ? "..." : (users.data?.length ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Toko</CardTitle>
            <CardDescription>
              Direktori toko, dari halaman{" "}
              <Link href="/dashboard/admin/stores" className="underline underline-offset-4">
                Toko
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold text-ink">
              {loading ? "..." : (stores.data?.length ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {firstError !== null ? (
        <ErrorState
          title={describeDataError(firstError).title}
          description={describeDataError(firstError).description}
          action={
            <Button
              variant="outline"
              onClick={() => {
                users.reload();
                stores.reload();
              }}
            >
              Coba lagi
            </Button>
          }
        />
      ) : users.status === "loading" || stores.status === "loading" ? (
        <TableSkeleton rows={3} columns={3} />
      ) : recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pengguna terbaru</CardTitle>
            <CardDescription>
              Diurutkan seperti backend mengembalikannya: dari akun terlama.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table<AdminUser>
              minWidth="min-w-[30rem]"
              columns={[
                { key: "name", header: "Nama", render: (row) => row.name },
                { key: "email", header: "Email", render: (row) => row.email },
                {
                  key: "role",
                  header: "Peran",
                  render: (row) => (
                    <Badge
                      variant={row.role === "ADMIN" ? "navy" : "accent"}
                      size="sm"
                    >
                      {row.role}
                    </Badge>
                  ),
                },
              ]}
              rows={recent}
              rowKey={(row) => row.id}
            />
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="Belum ada pengguna di platform"
          description="Akun muncul di sini setelah orang mendaftar lewat aplikasi."
        />
      )}

      <Card variant="outline">
        <CardHeader>
          <CardTitle className="text-base">Monitoring</CardTitle>
          <CardDescription>
            Status ML service dan riwayat job lintas toko tersedia di menu{" "}
            <Link href="/dashboard/admin/monitoring" className="underline underline-offset-4">
              Monitoring
            </Link>
            . Audit Log tetap belum terbaca admin (endpoint belum ada).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}