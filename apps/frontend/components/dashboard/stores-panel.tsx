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
  Input,
  Table,
  TableSkeleton,
} from "@/components/ui";

import { describeDataError } from "@/lib/dashboard-errors";
import {
  MAX_PAGE_SIZE,
  listAccessibleStores,
  listStoreMembers,
  updateStore,
} from "@/lib/dashboard-data";
import type { StoreMember, StoreSummary } from "@/lib/dashboard-data";

import { useApiResource, toApiError } from "./use-api-resource";
import { useSession } from "./session-provider";
import { CreateStorePanel } from "./create-store-panel";
import { InviteMemberForm } from "./invite-member-form";

/**
 * Halaman toko untuk OWNER dan STAFF.
 *
 * ## Read-only bukan sekadar disembunyikan tombolnya
 *
 * Untuk STAFF, form ubah nama/kota TIDAK DI-RENDER sama sekali - bukan
 * disable, bukan disembunyikan dengan CSS. Peran yang menentukan itu adalah
 * peran di toko (`StoreSummary.role`), bukan peran platform: orang yang
 * OWNER di toko A dan STAFF di toko B tetap punya kendali atas toko A, dan
 * memberships di dua toko itu bisa berbeda.
 *
 * Menyembunyikan kontrol adalah UX (R-39). Yang benar-benar menolak adalah
 * `@StoreAccess(StoreMemberRole.OWNER)` di backend, yang menjawab
 * `INSUFFICIENT_ROLE`; jalur itu sudah hidup karena semua mutasi lewat
 * `sessionRequest` dan error-nya ditampilkan apa adanya.
 *
 * ## Kenapa daftar anggota diambil per toko
 *
 * `GET /stores/:storeId/members` butuh satu request per toko, jadi hasilnya
 * tidak diambil bersama daftar toko. Kegagalan ditangani per toko: satu toko
 * yang error (mis. `SUSPENDED`) tidak boleh menyembunyikan toko lain yang
 * sehat.
 */
export function StoresPanel() {
  const { profile } = useSession();

  // Dipakai sebagai bagian dari identitas cache: berubah dari `null` ke
  // `{...}` setelah profil selesai dimuat, jadi loader di bawah ikut
  // mengambil ulang saat itu terjadi.
  const load = React.useCallback(() => listAccessibleStores(), []);

  const stores = useApiResource(load);

  return (
    <div className="flex flex-col gap-6">
      <ReadOnlyNotice />

      {stores.status === "loading" ? (
        <TableSkeleton rows={3} columns={3} />
      ) : stores.status === "error" && stores.error !== null ? (
        <ErrorState
          title={describeDataError(stores.error).title}
          description={describeDataError(stores.error).description}
          action={
            <Button variant="outline" onClick={stores.reload}>
              Coba lagi
            </Button>
          }
        />
      ) : stores.data !== null && stores.data.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {stores.data.map((store) => (
            <li key={store.id}>
              <StoreCard
                store={store}
                canManage={store.role === "OWNER"}
                currentUserId={profile?.id ?? null}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-4">
          <EmptyState
            title="Belum ada toko yang bisa Anda akses"
            description={
              <>
                Daftar ini berasal dari keanggotaan toko Anda sendiri, jadi
                kosong berarti Anda belum menjadi anggota toko mana pun. Buat
                toko pertama Anda di bawah, atau tunggu undangan dari pemilik
                toko yang sudah ada.
              </>
            }
          />
          <CreateStorePanel onCreated={stores.reload} />
        </div>
      )}
    </div>
  );
}

/**
 * Penjelasan read-only untuk STAFF.
 *
 * Ditampilkan sebagai catatan, bukan modal atau tooltip: bagi PEGAWI, fakta
 * bahwa ia tidak boleh mengubah apa pun adalah hal yang perlu diketahui
 * sebelum ia mencari-cari tombol yang memang tidak ada.
 */
function ReadOnlyNotice() {
  const { profile } = useSession();

  return (
    <p className="rounded-[var(--radius-card)] border border-line bg-neutral-wash px-4 py-3 text-sm text-ink-muted">
      {profile === null
        ? "Memuat peran Anda..."
        : "Halaman ini menampilkan data toko sesuai keanggotaan Anda. Perubahan nama dan kota hanya bisa dilakukan pemilik toko."}
    </p>
  );
}

function StoreCard({
  store,
  canManage,
  currentUserId,
}: {
  store: StoreSummary;
  canManage: boolean;
  currentUserId: string | null;
}) {
  const load = React.useCallback(
    () => listStoreMembers(store.id),
    [store.id],
  );
  const members = useApiResource(load);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{store.name}</CardTitle>
          <div className="flex items-center gap-2">
            <StoreStatusBadge status={store.status} />
            <Badge variant={store.role === "OWNER" ? "accent" : "neutral"} size="sm">
              {store.role === "OWNER" ? "Anda pemilik toko ini" : "Anda pegawai"}
            </Badge>
          </div>
        </div>
        <CardDescription>
          {store.city === null || store.city.length === 0
            ? "Kota belum diisi"
            : store.city}{" "}
           |  Zona waktu {store.timezone}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {members.status === "loading" ? (
          <TableSkeleton rows={2} columns={3} />
        ) : members.status === "error" && members.error !== null ? (
          <ErrorState
            className="py-8"
            title={describeDataError(members.error).title}
            description={describeDataError(members.error).description}
            action={
              <Button variant="outline" size="sm" onClick={members.reload}>
                Coba lagi
              </Button>
            }
          />
        ) : members.data !== null && members.data.length > 0 ? (
          <Table<StoreMember>
            minWidth="min-w-[28rem]"
            columns={[
              { key: "name", header: "Anggota", render: (row) => row.user.name },
              { key: "email", header: "Email", render: (row) => row.user.email },
              {
                key: "role",
                header: "Peran",
                render: (row) => (
                  <Badge
                    variant={row.role === "OWNER" ? "accent" : "neutral"}
                    size="sm"
                  >
                    {row.role === "OWNER" ? "Pemilik" : "Pegawai"}
                    {row.userId === currentUserId ? " (Anda)" : ""}
                  </Badge>
                ),
              },
            ]}
            rows={members.data}
            rowKey={(row) => row.userId}
            caption="Anggota toko ini. Di backend, daftar ini dibaca lewat delegate yang ter-scope per toko, jadi anggota toko lain tidak mungkin ikut terbawa."
          />
        ) : (
          <EmptyState
            className="py-8"
            title="Belum ada anggota"
            description="Keanggotaan toko dibuat lewat undangan, dan belum ada undangan yang diterima pada toko ini."
          />
        )}
      </CardContent>

      {canManage ? <StoreEditor store={store} /> : null}
      {canManage ? <InviteMemberForm storeId={store.id} /> : null}
    </Card>
  );
}

/**
 * Form ubah nama dan kota.
 *
 * Hanya dirender untuk OWNER toko itu. `PATCH /stores/:storeId` menolak
 * `city: ""`? Tidak: DTO-nya `@IsOptional()` tanpa `@MinLength`, jadi string
 * kosong sah dan berarti "kosongkan kota" - itu perilaku yang diinginkan dan
 * bukan sesuatu yang perlu dilawan di UI.
 */
function StoreEditor({ store }: { store: StoreSummary }) {
  const [name, setName] = React.useState(() => store.name);
  const [city, setCity] = React.useState(() => store.city ?? "");
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (name.trim().length < 2) {
      setMessage({
        tone: "error",
        text: "Nama toko minimal 2 karakter. Ini aturan backend (MinLength 2), bukan prefersi form.",
      });
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const updated = await updateStore(store.id, {
        name: name.trim(),
        city: city.trim(),
      });
      setName(updated.name);
      setCity(updated.city ?? "");
      setMessage({ tone: "ok", text: "Perubahan nama dan kota tersimpan." });
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
    <form
      onSubmit={handleSubmit}
      className="mt-4 flex flex-col gap-3 border-t border-line pt-4"
    >
      <p className="text-sm font-medium text-ink">Ubah data toko</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
          Nama toko
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={191}
            disabled={pending}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
          Kota
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
          {pending ? "Menyimpan..." : "Simpan perubahan"}
        </Button>
        {message !== null ? (
          <p
            role="status"
            className={
              message.tone === "ok" ? "text-sm text-positive" : "text-sm text-critical"
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function StoreStatusBadge({ status }: { status: StoreSummary["status"] }) {
  if (status === "SUSPENDED") {
    return (
      <Badge variant="critical" size="sm">
        Nonaktif
      </Badge>
    );
  }
  return (
    <Badge variant="positive" size="sm">
      Aktif
    </Badge>
  );
}

/**
 * Catatan jujur ketika baris yang diterima tepat sebesar batas halaman.
 *
 * `pageSize=100` adalah batas yang diterima backend (`PageQueryDto`), dan
 * `apiRequest` membuang `meta`, jadi jumlah total tidak diketahui di sini.
 * Menyembunyikan batas itu akan membuat "100 pengguna" terbaca seperti
 * "seluruh pengguna".
 */
export function PageCapNote({ shown, noun }: { shown: number; noun: string }) {
  if (shown < MAX_PAGE_SIZE) return null;
  return (
    <p className="text-xs text-ink-muted">
      Menampilkan {MAX_PAGE_SIZE} {noun} pertama. Paginasi lengkap menyusul di
      fase berikutnya.
    </p>
  );
}