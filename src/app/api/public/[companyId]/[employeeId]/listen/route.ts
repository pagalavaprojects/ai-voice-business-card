import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { Logger } from "@/shared/lib/logger";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Records a GENUINE, user-initiated card interaction (playing the
 * Introduction / Elevator / Service / Why Us) for the per-user listening
 * analytics on the dashboard. It is fired ONLY when the visitor actually
 * starts playback — never by the background prefetch / Range warm-up, which
 * makes a bodyless range fetch and never calls this route.
 *
 * De-duplication is by a client-generated `eventId` (one per genuine play):
 * the upsert ignores a duplicate id, so a React re-render, a double click or a
 * network retry cannot inflate a count, while a legitimate replay (a fresh id)
 * is counted. Attribution is the card visit's own `sessionId` — never an
 * invented user; the lead is linked later, at qualification/booking time.
 *
 * Fail-open and prod-safe: if the `listen_events` table has not been applied
 * yet (its migration is pending an authorized apply), this degrades to a
 * silent no-op (recorded:false) rather than 500ing — the card is never
 * affected by analytics being off.
 */
// intro_replay = the visitor played the Introduction again (Replay button or a
// second tap) — reported separately from the first genuine play; smart_play =
// the Smart AI Lead Business Card pitch.
const EVENT_TYPES = ["intro_play", "intro_replay", "elevator_play", "product_play", "usp_play", "smart_play"] as const;

const BodySchema = z.object({
  sessionId: z.string().trim().min(8).max(128),
  eventId: z.string().trim().min(8).max(64),
  eventType: z.enum(EVENT_TYPES),
});

export async function POST(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  const identifier = req.headers.get("x-forwarded-for") || "unknown";
  // A visitor can only genuinely play a handful of clips a minute; this bounds
  // a script trying to stuff the analytics without starving a real user.
  const { allowed } = await checkRateLimitDistributed(`listen:${identifier}`, 60, 10 * 60_000);
  if (!allowed) return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  try {
    const { error } = await supabaseAdmin.from("listen_events").upsert(
      {
        event_id: parsed.data.eventId,
        company_id: params.companyId,
        employee_id: params.employeeId,
        session_id: parsed.data.sessionId,
        event_type: parsed.data.eventType,
      },
      { onConflict: "event_id", ignoreDuplicates: true }
    );
    // 42P01 = undefined_table: analytics table not applied yet — degrade to a
    // silent no-op rather than surfacing an error to the public card.
    if (error && error.code !== "42P01") {
      Logger.warn("listen event record failed", { code: error.code });
      return NextResponse.json({ ok: true, recorded: false });
    }
    return NextResponse.json({ ok: true, recorded: !error }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    Logger.warn("listen event record exception", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: true, recorded: false });
  }
}
