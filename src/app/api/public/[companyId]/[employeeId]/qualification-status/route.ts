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
      return NextResponse.json({ qualified: false, temperature: null, answers: [] });
    }

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("lead_temperature, qualification_notes")
      .eq("conversation_id", conversation.id)
      .eq("company_id", params.companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const temperature = lead?.lead_temperature ?? null;
    // The per-question answer records the sequencing tool appends to
    // qualification_notes ("Qn [YES|NO|MAYBE] (ISO): english answer") —
    // parsed back out so the booking UI can show the visitor their OWN
    // answers in English. Non-matching note lines (the AI's internal
    // reasoning) are never exposed.
    const answers = (lead?.qualification_notes ?? "")
      .split("\n")
      .map((line: string) => /^Q(\d+) \[(YES|NO|MAYBE)\] \([^)]*\): (.*)$/.exec(line.trim()))
      .filter((m: RegExpExecArray | null): m is RegExpExecArray => m !== null)
      .map((m: RegExpExecArray) => ({ n: Number(m[1]), c: m[2], a: m[3] }));

    return NextResponse.json(
      { qualified: temperature !== null, temperature, answers },
      // Never cached: the whole point is watching this change mid-call.
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    Logger.warn("qualification-status lookup failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ qualified: false, temperature: null, answers: [] });
  }
}
