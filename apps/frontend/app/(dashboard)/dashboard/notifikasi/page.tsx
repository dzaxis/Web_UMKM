import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { NotificationPanel } from "@/components/dashboard/notification-panel";

export const metadata: Metadata = {
  title: "Notifikasi – BisnisInsight",
};

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifikasi"
        description="Pusat notifikasi per toko yang bisa Anda akses."
      />
      <NotificationPanel />
    </>
  );
}
