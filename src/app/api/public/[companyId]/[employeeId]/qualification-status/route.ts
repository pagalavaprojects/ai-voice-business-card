import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { Logger } from "@/shared/lib/logger";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Read-only poll the booking flow's voice-qualification step uses to learn
 * whether the live AI conversation has completed the six authoritative
 * questions yet. Chain: the browser's Vapi call id ->
 * conversations.vapi_call_id -> the lead the webhook's
 * get_next_qualification_question wrote for that conversation ->
 * qualification_notes.
 *
 * Completion is genuine question-6-answered state, not a lead-scoring
 * byproduct: qualification completion and lead scoring are deliberately
 * separate concerns (scoring, where it still happens via save_lead/
 * update_lead_qualification, is informational for internal reporting only
 * and never gates this).
 *
 * Deliberately narrow response otherwise: no lead id, no name/email/phone,
 * no internal notes beyond the parsed answer pairs — this is polled from
 * the public, unauthenticated card, scoped to the caller's own live call
 * id, which is unguessable outside the session.
 */
export async function GET(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  const identifier = req.headers.get("x-forwarded-for") || "unknown";
  // The booking modal polls every 3s while qualification is active — that
  // alone is 200 requests per 10-minute window, so the previous limit of
  // 120 starved any conversation running longer than ~6 minutes: every
  // later poll got a silent 429 and the Continue button could never
  // appear even after Q6 completed. 480 covers one full-window poller
  // twice over (two visitors behind one NAT IP) while still bounding
  // callId enumeration, which is additionally guarded by the unguessable
  // callId itself and the company/employee scoping of every lookup.
  const { allowed } = await checkRateLimitDistributed(`qual-status:${identifier}`, 480, 10 * 60_000);
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
      return NextResponse.json({ qualified: false, answers: [] });
    }

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("qualification_notes")
      .eq("conversation_id", conversation.id)
      .eq("company_id", params.companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // The per-question answer records the sequencing tool appends to
    // qualification_notes ("Qn [YES|NO|MAYBE] (ISO): english answer") —
    // parsed back out so the booking UI can show the visitor their OWN
    // answers. Non-matching note lines (the AI's internal reasoning) are
    // never exposed.
    const answers = (lead?.qualification_notes ?? "")
      .split("\n")
      .map((line: string) => /^Q(\d+) \[(YES|NO|MAYBE)\] \([^)]*\): (.*)$/.exec(line.trim()))
      .filter((m: RegExpExecArray | null): m is RegExpExecArray => m !== null)
      .map((m: RegExpExecArray) => ({ n: Number(m[1]), c: m[2], a: m[3] }));

    // "Qualified" means genuine completion of all six questions — the
    // visitor has answered question 6 — not a lead-scoring byproduct.
    const qualified = answers.some((a: { n: number }) => a.n === 6);

    return NextResponse.json(
      { qualified, answers },
      // Never cached: the whole point is watching this change mid-call.
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    Logger.warn("qualification-status lookup failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ qualified: false, answers: [] });
  }
}
