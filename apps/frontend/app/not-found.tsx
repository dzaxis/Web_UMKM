import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Halaman tidak ditemukan</h1>
      <p className="text-sm text-ink-muted">
        Alamat yang Anda tuju tidak ada di aplikasi ini.
      </p>
      <Link href="/" className="text-sm text-accent underline">
        Kembali ke beranda
      </Link>
    </main>
  );
}
