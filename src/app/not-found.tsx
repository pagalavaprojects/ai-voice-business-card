import Link from "next/link";
import { Bot, Mic, Home } from "lucide-react";
import { DEMO_CARD_PATH } from "@/shared/lib/demoCard";

/**
 * App Router 404 boundary. Without this file Next serves its unstyled
 * default page, which on a product people reach by scanning a QR code or
 * tapping an NFC tag reads as a broken site rather than a mistyped link.
 *
 * This is deliberately PLATFORM-branded, not tenant-branded: this page also
 * catches an unresolved /c/{slug} short link, at which point we have no idea
 * which company or person was being looked for — there is no logo or photo
 * to show for a lookup that, by definition, didn't resolve to anyone. What
 * it can honestly offer is the platform's own identity and a way back in,
 * not a fabricated "Contact this company" button with nowhere real to send it.
 */
export default function NotFound() {
  return (
    <main id="main-content" className="min-h-screen bg-[#070b12] text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] bg-sky-500/10 blur-[140px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/[0.07] blur-[130px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-sm w-full text-center space-y-5 motion-safe:animate-[card-rise_0.5s_ease-out]">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/30">
          <Bot className="h-7 w-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-sky-400">404</p>
          <h1 className="text-2xl font-extrabold tracking-tight">Card not found</h1>
          <p className="text-sm text-slate-400">
            This link doesn&apos;t point to an active business card. If you scanned a QR code or tapped an NFC card, check
            that the whole code was captured and try again.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <Link
            href="/"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2.5 text-xs font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            Back to home
          </Link>
          <Link
            href={DEMO_CARD_PATH}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            Talk to our demo AI
          </Link>
        </div>
      </div>
    </main>
  );
}
