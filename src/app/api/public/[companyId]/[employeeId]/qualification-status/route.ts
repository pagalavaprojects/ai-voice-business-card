import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { Logger } from "@/shared/lib/logger";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Read-only poll the booking flow's voice-qualification step uses to learn
 * whether the live AI conversation has produced a scored lead yet. Chain:
 * the browser's Vapi call id -> conversations.vapi_call_id -> the lead the
 * webhook's save_lead/update_lead_qualification wrote for that
 * conversation -> lead_temperature.
 *
 * Deliberately narrow response: a boolean and the temperature bucket only.
 * No lead id, no name/email/phone, no scores/notes — this is polled from
 * the public, unauthenticated card, and the temperature routing signal is
 * the ONLY thing the client needs (HOT/WARM -> conversion questions
 * continue; COLD -> straight to slot selection). The bucket is scoped to
 * the caller's own live call id, which is unguessable outside the session.
 */
export async function GET(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  const identifier = req.headers.get("x-forwarded-for") || "unknown";
  // Polled every few seconds during an active qualification call, so the
  // window is generous but still bounds enumeration attempts.
  const { allowed } = await checkRateLimitDistributed(`qual-status:${identifier}`, 120, 10 * 60_000);
  if (!allowed) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const callId = req.nextUrl.searchParams.get("callId");
  if (!callId || callId.length < 8 || callId.length > 128) {
    return NextResponse.json({ message: "callId required" }, { status: 400 });
  }

  try {
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("vapi_call_id", callId)
      .eq("company_id", params.companyId)
      .eq("employee_id", params.employeeId)
      .maybeSingle();

    if (!conversation) {
      return NextResponse.json({ qualified: false, temperature: null });
    }

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("lead_temperature")
      .eq("conversation_id", conversation.id)
      .eq("company_id", params.companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const temperature = lead?.lead_temperature ?? null;
    return NextResponse.json(
      { qualified: temperature !== null, temperature },
      // Never cached: the whole point is watching this change mid-call.
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    Logger.warn("qualification-status lookup failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ qualified: false, temperature: null });
  }
}
