"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { Button } from "@/components/ui";
import { acceptInvitation, previewInvitation } from "@/lib/dashboard-data";
import type { InvitationPreview } from "@/lib/dashboard-data";
import { describeDataError } from "@/lib/dashboard-errors";
import { hasAccessToken } from "@/lib/auth-session";

/**
 * Halaman terima undangan.
 *
 * Preview undangan publik dimuat saat komponen mount. Tombol Terima hanya
 * bekerja kalau access token tercatat di peramban; kalau tidak, pengguna
 * dialihkan ke `/login?next=...`. Kalau API mengembalikan `UNAUTHORIZED`,
 * tindakan yang sama juga dirender, sehingga pengguna tidak mentok di
 * halaman ini.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = React.useState<InvitationPreview | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [accepting, setAccepting] = React.useState(false);
  const [accepted, setAccepted] = React.useState<{
    storeName: string;
    role: InvitationPreview["role"];
  } | null>(null);

  const loginUrl = `/login?next=${encodeURIComponent(`/invitations/${token}`)}` as Route;

  React.useEffect(() => {
    let cancelled = false;

    previewInvitation(token)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          const copy = describeDataError(caught as never);
          setErrorMessage(
            [copy.title, copy.description].filter(Boolean).join(" ") ||
              "Undangan tidak dapat dimuat.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept(): Promise<void> {
    if (accepting) return;

    if (!hasAccessToken()) {
      router.replace(loginUrl);
      return;
    }

    setAccepting(true);
    setErrorMessage(null);
    try {
      const result = await acceptInvitation(token);
      setAccepted({ storeName: result.storeName, role: result.role });
    } catch (caught) {
      const code = (caught as { code?: string } | null)?.code;
      if (code === "UNAUTHORIZED") {
        router.replace(loginUrl);
        return;
      }
      const copy = describeDataError(caught as never);
      setErrorMessage(
        [copy.title, copy.description].filter(Boolean).join(" ") ||
          "Undangan tidak dapat diterima.",
      );
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center px-4">
        <p className="text-sm text-ink-muted">Memuat undangan...</p>
      </main>
    );
  }

  if (errorMessage !== null && preview === null) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-12">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Undangan tidak berlaku
        </h1>
        <p className="text-ink-muted">{errorMessage}</p>
        <Link href={loginUrl} className="text-sm text-accent underline">
          Masuk ke akun Anda
        </Link>
      </main>
    );
  }

  if (accepted !== null) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-12">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Selamat datang di {accepted.storeName}
        </h1>
        <p className="text-ink-muted">
          Anda tercatat sebagai{" "}
          {accepted.role === "OWNER" ? "Pemilik" : "Pegawai"} toko. Silakan
          masuk ke dashboard untuk mulai bekerja.
        </p>
        <Link href="/dashboard/toko" className="text-sm text-accent underline">
          Buka dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">
        Undangan bergabung ke toko
      </h1>

      {preview !== null ? (
        <>
          <p className="text-ink-muted">
            Anda diundang ke{" "}
            <span className="font-medium text-ink">{preview.storeName}</span>{" "}
            sebagai{" "}
            <span className="font-medium text-ink">
              {preview.role === "OWNER" ? "Pemilik" : "Pegawai"}
            </span>
            .
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-ink-muted">
            <dt>Email tujuan</dt>
            <dd className="text-ink">{preview.email}</dd>
            <dt>Berlaku hingga</dt>
            <dd className="text-ink">
              {new Date(preview.expiresAt).toLocaleString("id-ID")}
            </dd>
          </dl>
        </>
      ) : null}

      {errorMessage !== null ? (
        <p role="alert" className="text-sm text-critical">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleAccept}
          disabled={accepting}
          size="sm"
        >
          {accepting ? "Menerima..." : "Terima undangan"}
        </Button>
        <Link href={loginUrl} className="text-sm text-ink-muted underline">
          Masuk dengan akun lain
        </Link>
      </div>
    </main>
  );
}
