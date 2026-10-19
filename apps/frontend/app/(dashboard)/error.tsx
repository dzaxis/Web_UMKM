"use client";

import * as React from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[40vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">
        Bagian dashboard ini gagal dimuat
      </h1>
      <p className="text-sm text-ink-muted">
        Coba muat ulang. Jika masalah berulang, hubungi tim pendukung.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white"
      >
        Coba lagi
      </button>
    </main>
  );
}
