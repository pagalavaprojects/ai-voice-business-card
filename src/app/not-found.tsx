import Link from "next/link";

/** App Router 404 boundary. Without this file Next serves its unstyled
 * default page, which on a product people reach by scanning a QR code reads
 * as a broken site rather than a mistyped link. */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <p className="font-mono text-xs uppercase tracking-widest text-sky-400">404</p>
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="text-sm text-slate-400">
          This link doesn&apos;t point anywhere. If you scanned a QR code, check that the whole code was captured.
        </p>
        <Link
          href="/"
          className="inline-block text-xs font-semibold text-sky-400 hover:text-sky-300 underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
