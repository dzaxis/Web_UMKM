"use client";

import * as React from "react";
import { Button, Input } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";
import { useApiResource } from "./use-api-resource";

type Order = { id: string; items?: unknown[] };

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? "Permintaan gagal");
  return json.data as T;
}

export function OrdersPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [customerCode, setCustomerCode] = React.useState("C1");
  const [customerName, setCustomerName] = React.useState("Ridho");
  const [sku, setSku] = React.useState("P1");
  const [qty, setQty] = React.useState("1");
  const [price, setPrice] = React.useState("3000");

  const load = React.useCallback(async (): Promise<Order[]> => {
    if (!storeId) return [];
    return api<Order[]>(`/stores/${storeId}/orders`, "GET");
  }, [storeId]);

  const orders = useApiResource(load);

  React.useEffect(() => {
    if (session.status !== "ready") return;
    let active = true;
    void listAccessibleStores()
      .then((items) => {
        if (!active) return;
        setStores(items);
        if (items.length > 0) setStoreId(items[0].id);
      })
      .catch(() => {
        if (active) setMessage("Gagal memuat toko");
      });
    return () => {
      active = false;
    };
  }, [session.status]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!storeId) return;
    try {
      await api(`/stores/${storeId}/customers`, "POST", { code: customerCode, name: customerName });
      await api(`/stores/${storeId}/orders/manual`, "POST", {
        customerCode,
        customerName,
        orderDate: "2026-01-01",
        channel: "online",
        items: [{ productSku: sku, qty: Number(qty), price: Number(price) }],
      });
      setMessage("Order dibuat");
      orders.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border p-4">
        <select value={storeId ?? ""} onChange={(e) => setStoreId(e.target.value)} className="mb-3 rounded border bg-background px-3 py-2 text-sm">
          {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} placeholder="Kode pelanggan" />
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nama pelanggan" />
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU produk" />
          <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Harga" />
          <Button type="submit">Buat order manual</Button>
        </form>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>

      {orders.status === "loading" ? (
        <p className="text-sm text-muted-foreground">Memuat pesanan...</p>
      ) : orders.status === "error" && orders.error !== null ? (
        <div className="flex items-center gap-3 text-sm text-red-700">
          <span>{orders.error.message}</span>
          <Button size="sm" variant="outline" onClick={orders.reload}>
            Coba lagi
          </Button>
        </div>
      ) : orders.data !== null && orders.data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {orders.data.map((order) => (
            <li key={order.id} className="rounded border p-3 text-sm">
              {order.id} · {order.items?.length ?? 0} item
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada pesanan pada toko ini.</p>
      )}
    </div>
  );
}
