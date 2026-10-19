"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";
import { JobResultView } from "./job-result-view";

type JobType = "forecast" | "segmentation" | "basket" | "churn" | "anomaly";

const JOB_OPTIONS: { value: JobType; label: string }[] = [
  { value: "forecast", label: "Forecast Penjualan (30 hari)" },
  { value: "segmentation", label: "Segmentasi Pelanggan (RFM)" },
  { value: "basket", label: "Market Basket (Bundling)" },
  { value: "churn", label: "Customer Churn Risk" },
  { value: "anomaly", label: "Deteksi Anomali Penjualan" },
];

type JobStatus = "queued" | "running" | "completed" | "failed";

type JobResult = {
  jobId: string;
  status: JobStatus;
  jobType: string;
  result?: unknown;
  explanation?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

export function AnalyticsJobPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [jobType, setJobType] = React.useState<JobType>("forecast");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [job, setJob] = React.useState<JobResult | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (session.status !== "ready" || !session.profile) return;
    void listAccessibleStores()
      .then((items) => {
        setStores(items);
        if (items.length > 0) setStoreId(items[0].id);
      })
      .catch(() => setMessage("Gagal memuat toko"));
  }, [session.status, session.profile]);

  async function submit() {
    if (!storeId) return;
    setSubmitting(true);
    setMessage(null);
    setJob(null);
    try {
      const res = await fetch(`${API_BASE_URL}${API_PREFIX}/stores/${storeId}/analytics/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType, parameters: {} }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Gagal submit job");
      const id = data.data.jobId;
      setJobId(id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal submit");
    } finally {
      setSubmitting(false);
    }
  }

  // polling
  React.useEffect(() => {
    if (!jobId || !storeId) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}${API_PREFIX}/stores/${storeId}/analytics/jobs/${jobId}`,
          { credentials: "include" },
        );
        const data = await res.json();
        if (!active) return;
        if (res.ok) setJob(data.data);
        if (data?.data?.status === "completed" || data?.data?.status === "failed") {
          stop();
        }
      } catch {
        if (active) setMessage("Gagal polling status");
        stop();
      }
    };

    void poll();
    timer = setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      stop();
    };
  }, [jobId, storeId]);

  return (
    <div className="space-y-6">
      {message && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{message}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Jalankan Analisis ML</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-center flex-wrap">
            <select
              value={storeId || ""}
              onChange={(e) => setStoreId(e.target.value || null)}
              className="border rounded px-3 py-2"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value as JobType)}
              className="border rounded px-3 py-2"
            >
              {JOB_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button onClick={submit} disabled={submitting || !storeId}>
              {submitting ? "Mengirim..." : "Jalankan Analisis"}
            </Button>
          </div>
          <p className="text-sm text-gray-600">
            Sistem akan memproses analisis secara asynchronous. Anda dapat menutup halaman; hasil tersimpan dan dapat dilihat kembali.
          </p>
        </CardContent>
      </Card>

      {job && (
        <Card>
          <CardHeader>
            <CardTitle>Status Job: {job.jobType}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">Job ID: </span>{job.jobId}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Status:</span>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  job.status === "completed"
                    ? "bg-green-100 text-green-700"
                    : job.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                }`}
              >
                {job.status}
              </span>
            </div>
            {job.explanation && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded text-sm">
                {job.explanation}
              </div>
            )}
            {job.errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {job.errorMessage}
              </div>
            )}
            {job.status === "completed" && job.result != null && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Hasil:</div>
                <JobResultView jobType={job.jobType} result={job.result} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
