"use client";

import * as React from "react";

import {
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

import { adminMlModels, listAdminMlJobs } from "@/lib/dashboard-data";
import { describeDataError } from "@/lib/dashboard-errors";
import { useApiResource } from "./use-api-resource";

type JobRow = {
  id: string;
  storeId: string | null;
  jobType: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

/**
 * Monitoring admin: job ML lintas toko + status ML service.
 *
 * Backend yang menegakkan `%ADMIN`: jika bukan admin, endpoint mengembalikan
 * 403 dan panel menampilkan pesan yang jujur.
 */
export function AdminMonitoringPanel() {
  const jobsResource = useApiResource(() =>
    listAdminMlJobs({ limit: 50 }),
  );
  const healthResource = useApiResource(() => adminMlModels());

  const jobs = jobsResource.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Status ML service</CardTitle>
          <CardDescription>Hasil GET /admin/ml-models.</CardDescription>
        </CardHeader>
        <CardContent>
          {healthResource.status === "loading" ? (
            <TableSkeleton rows={2} columns={1} />
          ) : healthResource.status === "error" && healthResource.error !== null ? (
            <ErrorState
              title={describeDataError(healthResource.error).title}
              description={describeDataError(healthResource.error).description}
              action={
                <Button variant="outline" size="sm" onClick={healthResource.reload}>
                  Coba lagi
                </Button>
              }
            />
          ) : (
            <pre className="overflow-x-auto rounded bg-neutral-wash p-3 text-xs">
              {JSON.stringify(healthResource.data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat job ML lintas toko</CardTitle>
          <CardDescription>
            Urutan createdAt terbaru, dibatasi 50 baris.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobsResource.status === "loading" ? (
            <TableSkeleton rows={5} columns={5} />
          ) : jobsResource.status === "error" && jobsResource.error !== null ? (
            <ErrorState
              title={describeDataError(jobsResource.error).title}
              description={describeDataError(jobsResource.error).description}
              action={
                <Button variant="outline" size="sm" onClick={jobsResource.reload}>
                  Coba lagi
                </Button>
              }
            />
          ) : jobs.length === 0 ? (
            <EmptyState
              title="Belum ada job ML"
              description="Job akan muncul di sini setelah analisis dijalankan."
            />
          ) : (
            <Table<JobRow>
              minWidth="min-w-[40rem]"
              columns={[
                { key: "id", header: "Job", render: (row) => row.id.slice(0, 8) },
                {
                  key: "store",
                  header: "Toko",
                  render: (row) => (row.storeId ?? "-").slice(0, 8),
                },
                { key: "type", header: "Jenis", render: (row) => row.jobType },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => row.status,
                },
                {
                  key: "created",
                  header: "Dibuat",
                  render: (row) =>
                    new Date(row.createdAt).toLocaleString("id-ID"),
                },
              ]}
              rows={jobs as JobRow[]}
              rowKey={(row) => row.id}
              caption="Job ML lintas toko. Hanya ADMIN yang boleh melihat sensitif data ini."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
