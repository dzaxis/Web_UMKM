"use client";

import * as React from "react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "@/components/ui";

import { createStore } from "@/lib/dashboard-data";
import { describeDataError } from "@/lib/dashboard-errors";

import { toApiError } from "./use-api-resource";

/**
 * Form buat toko untuk pengguna yang belum punya toko.
 *
 * Ini satu-satunya jalur UI ke `POST /stores`. Tanpa form ini, pendaftar baru
 * selalu mendarat di dashboard kosong: backend menangani pembuatannya, tetapi
 * tidak ada satu pun tombol yang memanggilnya.
 *
 * `city` opsional dan dikirim sebagai field terpisah hanya kalau ada isinya -
 * `dashboard-data.createStore` yang memutuskan bentuk body, jadi komponen ini
 * tidak perlu tahu kontrak `CreateStoreDto`.
 */
export function CreateStorePanel({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (pending) return;

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setMessage({
        tone: "error",
        text: "Nama toko minimal 2 karakter.",
      });
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const trimmedCity = city.trim();
      await createStore(
        trimmedCity.length === 0
          ? { name: trimmedName }
          : { name: trimmedName, city: trimmedCity },
      );
      setMessage({
        tone: "ok",
        text: "Toko dibuat. Anda tercatat sebagai pemilik toko ini.",
      });
      onCreated();
    } catch (caught) {
      const copy = describeDataError(toApiError(caught));
      setMessage({
        tone: "error",
        text: [copy.title, copy.description].filter(Boolean).join(" "),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat toko pertama Anda</CardTitle>
        <CardDescription>
          Anda belum menjadi anggota toko mana pun. Buat toko di sini, lalu
          undang pegawai dan unggah data penjualan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
              Nama toko
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={191}
                placeholder="Contoh: Warung Bu Tuti"
                disabled={pending}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
              Kota (opsional)
              <Input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                maxLength={191}
                placeholder="Contoh: Bandung"
                disabled={pending}
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Membuat..." : "Buat toko"}
            </Button>
            {message !== null ? (
              <p
                role="status"
                className={
                  message.tone === "ok"
                    ? "text-sm text-positive"
                    : "text-sm text-critical"
                }
              >
                {message.text}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
