import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { Logger } from "@/shared/lib/logger";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";
import { toolRegistry } from "@/core/infrastructure/bootstrap/assistantRuntime";
import { SupabaseConversationRepository } from "@/core/infrastructure/database/supabase/SupabaseConversationRepository";
import { isSupportedLanguage } from "@/features/language/config";

export const dynamic = "force-dynamic";

const conversationRepo = new SupabaseConversationRepository();

/**
 * The per-question answer records the sequencing tool appends to
 * qualification_notes ("Qn [YES|NO|MAYBE] (ISO): english answer"), parsed back
 * out so the booking UI can show the visitor their OWN answers. Non-matching
 * note lines (the AI's internal reasoning) are never exposed.
 */
function parseAnswers(notes: string | null | undefined): Array<{ n: number; c: string; a: string }> {
  return (notes ?? "")
    .split("\n")
    .map((line: string) => /^Q(\d+) \[(YES|NO|MAYBE)\] \([^)]*\): (.*)$/.exec(line.trim()))
    .filter((m: RegExpExecArray | null): m is RegExpExecArray => m !== null)
    .map((m: RegExpExecArray) => ({ n: Number(m[1]), c: m[2], a: m[3] }));
}

/** Reads the answers recorded so far for a session's conversation (by the
 * client-generated session id stored in conversations.vapi_call_id) — shared
 * by the GET poll and the POST answer submission below. */
async function readAnswers(companyId: string, employeeId: string, callId: string) {
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("vapi_call_id", callId)
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!conversation) return { conversationId: null as string | null, answers: [] as Array<{ n: number; c: string; a: string }> };

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("qualification_notes")
    .eq("conversation_id", conversation.id)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { conversationId: conversation.id as string, answers: parseAnswers(lead?.qualification_notes) };
}

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

    const answers = parseAnswers(lead?.qualification_notes);

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

/**
 * Submits ONE qualification answer for the text/button (voiceless) booking
 * flow. The visitor taps Yes/No/Maybe on screen; there is no Vapi call, no
 * microphone, no TTS. The answer is classified and persisted by the SAME
 * server-authoritative sequencing tool the live voice call uses
 * (get_next_qualification_question) — so the recorded record, the dashboard
 * funnel and this endpoint's own GET poll are all identical whether the six
 * data points were answered by voice or by tapping. The client owns only an
 * unguessable session id (its role is the voice flow's callId), stored in
 * conversations.vapi_call_id so the GET above reads it back unchanged.
 *
 * Returns the authoritative answers array so the UI advances directly from the
 * response — no polling needed. Forward-only and duplicate-safe are inherited
 * from the tool: it no-ops a question already recorded and never regresses.
 */
export async function POST(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  const identifier = req.headers.get("x-forwarded-for") || "unknown";
  // Six answers per booking; this covers many visitors behind one NAT plus
  // retries, while bounding session enumeration (the unguessable session id is
  // the primary guard).
  const { allowed } = await checkRateLimitDistributed(`qual-answer:${identifier}`, 120, 10 * 60_000);
  if (!allowed) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const questionNumber = Number(body?.questionNumber);
  const answer = typeof body?.answer === "string" ? body.answer : "";
  const language = isSupportedLanguage(body?.language) ? body.language : undefined;

  if (sessionId.length < 8 || sessionId.length > 128) {
    return NextResponse.json({ message: "sessionId required" }, { status: 400 });
  }
  if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 6) {
    return NextResponse.json({ message: "questionNumber must be 1-6" }, { status: 400 });
  }
  if (!answer || answer.length > 100) {
    return NextResponse.json({ message: "answer required" }, { status: 400 });
  }

  try {
    // One conversation row per session (keyed by the session id in the
    // vapi_call_id column, exactly like a voice call's), so the lead the tool
    // writes attaches by conversation_id and the GET poll resolves it.
    const conversation = await conversationRepo.getOrCreateConversationByVapiCallId(params.companyId, params.employeeId, sessionId, language);

    const tool = toolRegistry.getTool("get_next_qualification_question");
    if (!tool) {
      Logger.error("qualification-answer: get_next_qualification_question tool missing from registry");
      return NextResponse.json({ message: "Qualification is temporarily unavailable." }, { status: 503 });
    }

    const result = (await tool.execute(
      { last_answered_question: questionNumber, user_response: answer },
      { companyId: params.companyId, employeeId: params.employeeId, conversationId: conversation.id, language }
    )) as { action?: string };

    // The tool has classified + persisted (idempotently); re-read the
    // authoritative record so the UI advances from server truth, not a client
    // guess. `accepted` is false only when the tap somehow failed to classify
    // (impossible for the three canonical labels, but reported honestly).
    const { answers } = await readAnswers(params.companyId, params.employeeId, sessionId);
    const qualified = answers.some((a) => a.n === 6);
    return NextResponse.json(
      { qualified, answers, accepted: result?.action !== "reprompt" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    Logger.warn("qualification-answer submission failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ message: "Could not record your answer — please try again." }, { status: 500 });
  }
}
