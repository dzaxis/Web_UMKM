"use client";

import * as React from "react";
import { Button, Input } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { canManageStore } from "@/lib/dashboard-nav";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";
import { useApiResource } from "./use-api-resource";

type Product = { id: string; sku: string; name: string };

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

export function CatalogPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [sku, setSku] = React.useState("");
  const [name, setName] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const canManage = canManageStore(stores, storeId);

  const load = React.useCallback(async (): Promise<Product[]> => {
    if (!storeId) return [];
    return api<Product[]>(`/stores/${storeId}/products`, "GET");
  }, [storeId]);

  const products = useApiResource(load);

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

  async function createProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!storeId) return;
    try {
      await api(`/stores/${storeId}/products`, "POST", {
        sku,
        name,
        category: "Umum",
        unit: "pc",
      });
      setSku("");
      setName("");
      setMessage(null);
      products.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded border p-4">
        <select
          value={storeId ?? ""}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded border bg-background px-3 py-2 text-sm"
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
        {canManage ? (
          <form onSubmit={createProduct} className="flex flex-col gap-3">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama produk" />
            <Button type="submit">Tambah produk</Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            Form tambah produk hanya tersedia untuk pemilik toko.
          </p>
        )}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>

      {products.status === "loading" ? (
        <p className="text-sm text-muted-foreground">Memuat produk...</p>
      ) : products.status === "error" && products.error !== null ? (
        <div className="flex items-center gap-3 text-sm text-red-700">
          <span>{products.error.message}</span>
          <Button size="sm" variant="outline" onClick={products.reload}>
            Coba lagi
          </Button>
        </div>
      ) : products.data !== null && products.data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {products.data.map((product) => (
            <li key={product.id} className="rounded border p-3 text-sm">
              {product.sku} · {product.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Belum ada produk pada toko ini. Tambahkan produk pertama Anda.
        </p>
      )}
    </div>
  );
}
