import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { AdminMonitoringPanel } from "@/components/dashboard/admin-monitoring-panel";

export const metadata: Metadata = {
  title: "Monitoring – BisnisInsight",
};

export default function AdminMonitoringPage() {
  return (
    <>
      <PageHeader
        title="Monitoring"
        description="Status ML service dan riwayat job ML lintas toko."
      />
      <AdminMonitoringPanel />
    </>
  );
}
