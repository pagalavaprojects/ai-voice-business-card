import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/shared/lib/logger";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";
import { buildPublicCardPayload } from "@/core/application/services/PublicCardPayload";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";

/** Intentionally unauthenticated — this is the data behind the public
 * voice business card (whoever scans the card's QR/NFC hits this route
 * with no session), unlike everything under /api/admin/*.
 *
 * This does return the assembled system prompt and tool definitions,
 * which is a real tradeoff: the browser needs them to start a live Vapi
 * call with `@vapi-ai/web`'s client SDK, which sends its assistant
 * config directly to Vapi from the browser — so the prompt is visible
 * in devtools network traffic either way once a call starts. Routing it
 * through our own endpoint first doesn't newly expose anything a call
 * wasn't already going to transmit from the browser; it just makes the
 * previously-unused server-side prompt assembly actually reach the
 * client call instead of every live call running a bare, prompt-less
 * model. serverUrl is also returned so tool-calls and the end-of-call
 * report route back to our webhook during the call.
 *
 * The payload itself is assembled in PublicCardPayload (2026-08-19
 * extraction) — shared verbatim with the card page's server render, so a
 * language switch fetched from here and a first paint rendered there can
 * never carry different data shapes. This route keeps only the HTTP
 * concerns: rate limiting and status mapping. */
// This is the first request every real page view makes only when the page's
// server render couldn't already supply the data (and once per language
// switch — see PublicBusinessCard's fetch effect), so the limit is
// deliberately generous: it exists to blunt scraping/enumeration of the
// companyId/employeeId space, not to throttle a normal visitor.
// Unauthenticated, so keyed by IP — same reasoning as the appointments
// route's own limiter.
async function enforceCardRateLimit(req: NextRequest): Promise<boolean> {
  const identifier = req.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = await checkRateLimitDistributed(`public-card-read:${identifier}`, 60, 10 * 60_000);
  return allowed;
}

export async function GET(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  const { companyId, employeeId } = params;

  if (!(await enforceCardRateLimit(req))) {
    return NextResponse.json({ message: "Too many requests — please try again shortly." }, { status: 429 });
  }

  try {
    const payload = await buildPublicCardPayload({
      companyId,
      employeeId,
      langParam: req.nextUrl.searchParams.get("lang"),
      requestOrigin: req.nextUrl.origin,
    });
    if (!payload) {
      return NextResponse.json({ message: "Business card not found" }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (err) {
    // Supabase unreachable/unconfigured (e.g. placeholder credentials) is
    // an infrastructure condition, not "this card doesn't exist" — the
    // client falls back to a local demo card either way, but the status
    // code distinguishes the two cases for anyone debugging deployment.
    Logger.warn("Public business card lookup failed", { companyId, employeeId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ message: "Business card service unavailable" }, { status: 503 });
  }
}
