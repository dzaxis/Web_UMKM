"use client";

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
  TableSkeleton,
} from "@/components/ui";

import { describeDataError } from "@/lib/dashboard-errors";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from "@/lib/dashboard-data";
import type { NotificationItem } from "@/lib/dashboard-data";

import { useApiResource, toApiError } from "./use-api-resource";

/**
 * Daftar notifikasi pengguna, dengan aksi tandai baca.
 *
 * Pembacaan dan mutasi tetap lewat `sessionRequest` (R-41), jadi refresh
 * token yang sedang berlangsung tidak akan memicu logout diam-diam di tengah
 * tindakan pengguna.
 */
export function NotificationPanel() {
  const load = React.useCallback(() => listNotifications({ limit: 50 }), []);
  const resource = useApiResource(load);
  const [unread, setUnread] = React.useState(0);
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    void unreadNotificationCount().then((count) => setUnread(count)).catch(() => {});
  }, [resource.data]);

  async function handleMarkRead(id: string) {
    if (pending === id) return;
    setPending(id);
    setMessage(null);
    try {
      await markNotificationRead(id);
      resource.reload();
      setUnread((prev) => Math.max(0, prev - 1));
    } catch (caught) {
      const copy = describeDataError(toApiError(caught));
      setMessage([copy.title, copy.description].filter(Boolean).join(" "));
    } finally {
      setPending(null);
    }
  }

  async function handleMarkAll() {
    setPending("all");
    setMessage(null);
    try {
      await markAllNotificationsRead();
      resource.reload();
      setUnread(0);
    } catch (caught) {
      const copy = describeDataError(toApiError(caught));
      setMessage([copy.title, copy.description].filter(Boolean).join(" "));
    } finally {
      setPending(null);
    }
  }

  const items = resource.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Belum dibaca: {unread}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleMarkAll}
          disabled={items.length === 0 || pending === "all"}
        >
          {pending === "all" ? "Menandai..." : "Tandai semua dibaca"}
        </Button>
      </div>

      {resource.status === "loading" ? (
        <TableSkeleton rows={4} columns={3} />
      ) : resource.status === "error" && resource.error !== null ? (
        <ErrorState
          title={describeDataError(resource.error).title}
          description={describeDataError(resource.error).description}
          action={
            <Button variant="outline" size="sm" onClick={resource.reload}>
              Coba lagi
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Tidak ada notifikasi"
          description="Notifikasi akan muncul di sini ketika ada kejadian pada toko Anda."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item: NotificationItem) => (
            <li key={item.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <Badge
                      variant={
                        item.severity === "warning" || item.severity === "error"
                          ? "critical"
                          : item.severity === "success"
                          ? "positive"
                          : "neutral"
                      }
                      size="sm"
                    >
                      {item.severity}
                    </Badge>
                  </div>
                  {item.body ? (
                    <CardDescription>{item.body}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-muted">
                    {new Date(item.createdAt).toLocaleString("id-ID")}
                    {item.readAt ? " (dibaca)" : ""}
                  </p>
                  {item.readAt === null ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleMarkRead(item.id)}
                      disabled={pending === item.id}
                    >
                      {pending === item.id ? "Menandai..." : "Tandai dibaca"}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {message ? <p className="text-sm text-critical">{message}</p> : null}
    </div>
  );
}
