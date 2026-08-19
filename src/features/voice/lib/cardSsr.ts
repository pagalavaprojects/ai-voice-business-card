// Server-only by construction: next/headers throws outside a server
// context, and nothing under the client component tree imports this module.
import { cookies, headers } from "next/headers";
import { buildPublicCardPayload } from "@/core/application/services/PublicCardPayload";
import type { PublicCardData } from "@/features/voice/components/PublicBusinessCard";
// From features/language/bundles, NEVER the useLanguage hook module: that
// file is "use client", which turns its exports into client-reference
// proxies here — calling one threw the minified "n is not a function" that
// silently disabled this entire SSR fast path on deploy 2970834.
import { loadBundle, LocaleBundle } from "@/features/language/bundles";
import { isSupportedLanguage, LanguageCode } from "@/features/language/config";
import { Logger } from "@/shared/lib/logger";

/**
 * Server-side card props for the two public card pages (2026-08-19 FCP
 * round). When the visitor's language cookie exists (persistLanguage mirrors
 * localStorage into it on every choice), the page can build the FULL card
 * payload — the identical object the /api/public route serves — plus the
 * matching locale bundle during server rendering, so the first paint is the
 * complete card with zero client fetches.
 *
 * Returns {} in every other case: no cookie (first-ever visit — the client
 * keeps its existing gate → resolve → fetch flow), an unknown/hidden card
 * (the client fetch reproduces its own honest not-found state), or any
 * build failure (SSR must never take down a page the client path could
 * still render — degrade to exactly the pre-SSR behavior instead).
 */
export interface SsrCardProps {
  initialCard?: PublicCardData;
  initialLanguage?: LanguageCode;
  initialBundle?: LocaleBundle;
}

const LANGUAGE_COOKIE = "pagalava.language";

export async function resolveSsrCardProps(companyId: string, employeeId: string): Promise<SsrCardProps> {
  try {
    // Inside the try with everything else: cookie access itself can throw
    // outside a live request scope (unit tests that stub only headers(),
    // static analysis passes), and the contract of this function is that NO
    // failure mode ever escapes — worst case is always "no SSR props".
    const cookieValue = cookies().get(LANGUAGE_COOKIE)?.value;
    if (!isSupportedLanguage(cookieValue)) return {};
    const host = headers().get("host") ?? (process.env.NEXT_PUBLIC_APP_URL || "https://maylaanai.com").replace(/^https?:\/\//, "");
    const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
    const payload = await buildPublicCardPayload({
      companyId,
      employeeId,
      langParam: cookieValue,
      requestOrigin: `${protocol}://${host}`,
    });
    if (!payload) return {};
    // The payload's language is the server-CLAMPED truth (an admin may have
    // disabled the cookie's language since it was set) — the hook must be
    // seeded with what was actually rendered, never the raw cookie.
    const effectiveLanguage = isSupportedLanguage(payload.language) ? payload.language : cookieValue;
    const bundle = await loadBundle(effectiveLanguage);
    // The builder's inferred type carries `| undefined` on a few optional DB
    // columns where the client interface says `| null` — a distinction the
    // API route's own JSON serialization already erases (undefined fields
    // drop out). Crossing the RSC boundary serializes identically, so this
    // cast asserts exactly what the client has always deserialized.
    return { initialCard: payload as unknown as PublicCardData, initialLanguage: effectiveLanguage, initialBundle: bundle };
  } catch (err) {
    Logger.warn("Card SSR payload build failed — falling back to client fetch", {
      companyId,
      employeeId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}
