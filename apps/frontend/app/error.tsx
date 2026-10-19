"use client";

import * as React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Dicatat ke console browser saja - tidak disebarkan ke layar pengguna.
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body>
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Terjadi kesalahan yang tidak terduga
          </h1>
          <p className="text-sm text-ink-muted">
            Kami sudah mencatat masalahnya. Coba muat ulang halaman, atau hubungi
            tim pendukung jika masalah berulang.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white"
          >
            Coba lagi
          </button>
        </main>
      </body>
    </html>
  );
}
