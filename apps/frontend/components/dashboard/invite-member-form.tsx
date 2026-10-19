"use client";

import * as React from "react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

import { inviteMember } from "@/lib/dashboard-data";
import { describeDataError } from "@/lib/dashboard-errors";

import { toApiError } from "./use-api-resource";

/**
 * Form penerbitan undangan pegawai, hanya untuk OWNER toko.
 *
 * Token yang dihasilkan tampil SATAU KALI - setelah form reset atau halaman
 * dimuat ulang, backend tidak mengembalikannya lagi (hanya digest-nya yang
 * tersimpan). Itu sebabnya form menyimpan token di hasil terakhir hingga
 * pengguna pindah, dan tidak membersihkannya otomatis.
 */
export function InviteMemberForm({ storeId }: { storeId: string }) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"OWNER" | "STAFF">("STAFF");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<
    { token: string; email: string; role: "OWNER" | "STAFF" } | null
  >(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;

    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0 || !trimmedEmail.includes("@")) {
      setError("Email tujuan wajib diisi dengan alamat yang valid.");
      return;
    }

    setPending(true);
    setError(null);
    setIssued(null);
    try {
      const result = await inviteMember(storeId, {
        email: trimmedEmail,
        role,
      });
      setIssued({
        token: result.token,
        email: result.email,
        role: result.role,
      });
      setEmail("");
    } catch (caught) {
      const copy = describeDataError(toApiError(caught));
      setError([copy.title, copy.description].filter(Boolean).join(" "));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Undang anggota baru</CardTitle>
        <CardDescription>
          Email undangan dikirim ke alamat di bawah. Menerima undangan
          membutuhkan akun yang sudah terdaftar dengan email yang sama.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
            Email tujuan
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
              placeholder="pegawai@contoh.id"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
            Peran di toko
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "OWNER" | "STAFF")
              }
              disabled={pending}
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:border-accent-deep"
            >
              <option value="STAFF">Pegawai</option>
              <option value="OWNER">Pemilik</option>
            </select>
          </label>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Menerbitkan..." : "Terbitkan undangan"}
            </Button>
            {error !== null ? (
              <p role="alert" className="text-sm text-critical">
                {error}
              </p>
            ) : null}
          </div>
        </form>

        {issued !== null ? (
          <div className="rounded-[var(--radius-card)] border border-line bg-neutral-wash px-4 py-3 text-sm text-ink">
            <p className="font-medium">
              Undangan untuk {issued.email} ({issued.role === "OWNER" ? "Pemilik" : "Pegawai"}) diterbitkan.
            </p>
            <p className="mt-1 text-ink-muted">
              Salin link di bawah dan kirimkan lewat saluran pribadi. Token ini
              hanya muncul satu kali; setelah halaman ini ditinggalkan, tidakan
              pengiriman ulang harus ulang dari awal undangan.
            </p>
            <code className="mt-2 block break-all rounded-md bg-surface px-2 py-1 text-xs">
              /invitations/{issued.token}
            </code>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
