import { Logger } from "@/shared/lib/logger";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";
import { IWhatsAppNotifier } from "@/core/infrastructure/notifications/WhatsAppNotifier";
import { IWhatsAppIdempotencyStore } from "@/core/infrastructure/notifications/WhatsAppIdempotency";

/**
 * Owner notification for a finished AI voice conversation — a concise,
 * server-derived summary of what the VISITOR talked about, sent to the
 * business owner's WhatsApp once per conversation.
 *
 * Design constraints (product + privacy):
 * - Server-owned: triggered from the Vapi webhook's end-of-call-report
 *   handling, never from React. WhatsApp being down must never affect the
 *   voice call itself — the caller treats this as best-effort.
 * - Sends ONLY visitor-said content and short derived fields. The system
 *   prompt, tool payloads, and any model-internal text never appear here:
 *   topics come exclusively from transcript lines attributed to the
 *   visitor, and the summary is either Vapi's own end-of-call summary or
 *   a neutral counts-only fallback.
 * - Idempotent: one summary per conversation, enforced through the same
 *   insert-or-conflict store the inbound webhook uses (key
 *   `conv-summary:{conversationId}`), so a Vapi end-of-call retry or a
 *   reconnect can never double-notify.
 * - Rate limited per employee so a burst of calls cannot flood the owner.
 * - Contact details appear ONLY when the visitor volunteered them during
 *   the call (the lead row save_lead created) — nothing is ever inferred.
 */

export interface ConversationSummaryInput {
  conversationId: string;
  employeeId: string;
  /** The business owner's WhatsApp number (employees.phone). */
  ownerPhone: string | null | undefined;
  startedAt?: string | null;
  language?: string | null;
  durationSeconds?: number | null;
  /** Vapi's end-of-call transcript ("AI: …\nUser: …" lines). */
  transcript?: string | null;
  /** Vapi's own end-of-call summary, when it provided one. */
  vapiSummary?: string | null;
  toolsCalled?: string[] | null;
  /** True when an appointment row is linked to this conversation. */
  appointmentLinked: boolean;
  /** The lead the visitor VOLUNTARILY created during the call, if any. */
  lead?: { name?: string | null; email?: string | null; phone?: string | null } | null;
}

export type ConversationIntent = "pricing" | "appointment" | "service" | "inquiry" | "general";

/** Strips control characters, collapses whitespace, and caps length — every
 * visitor-authored string passes through here before entering the message. */
function sanitize(text: string, maxLength: number): string {
  const cleaned = Array.from(text)
    .map((ch) => (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f ? " " : ch))
    .join("")
    .replace(/ +/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/** Lines the TRANSCRIPT attributes to the visitor — the only conversation
 * content that may leave the system. Assistant lines, system content, and
 * anything unattributed are deliberately excluded. */
export function extractVisitorLines(transcript: string | null | undefined): string[] {
  if (!transcript) return [];
  return transcript
    .split("\n")
    .map((line) => /^(?:user|human|customer)\s*:\s*(.+)$/i.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => sanitize(m[1], 90))
    .filter((line) => line.length > 0);
}

/** Keyword heuristic over what the visitor actually said — deterministic,
 * no model call (and therefore no dependency on AI credits or latency). */
export function deriveConversationIntent(visitorLines: string[], toolsCalled: string[] | null | undefined, appointmentLinked: boolean): ConversationIntent {
  const tools = toolsCalled ?? [];
  if (appointmentLinked || tools.includes("book_appointment")) return "appointment";
  const text = visitorLines.join(" ").toLowerCase();
  if (/\b(price|pricing|cost|charge|charges|fee|fees|budget|quote|quotation)\b/.test(text)) return "pricing";
  if (/\b(book|booking|appointment|meeting|schedule|calendar|slot)\b/.test(text)) return "appointment";
  if (/\b(service|services|product|products|solution|solutions|offer|offering)\b/.test(text)) return "service";
  return visitorLines.length > 0 ? "inquiry" : "general";
}

export interface BuiltConversationSummary {
  message: string;
  intent: ConversationIntent;
  appointmentInterest: "YES" | "UNKNOWN";
  followUpNeeded: boolean;
  visitorLineCount: number;
}

export function buildConversationSummaryMessage(input: ConversationSummaryInput): BuiltConversationSummary {
  const visitorLines = extractVisitorLines(input.transcript);
  const intent = deriveConversationIntent(visitorLines, input.toolsCalled, input.appointmentLinked);
  const tools = input.toolsCalled ?? [];
  const appointmentInterest: "YES" | "UNKNOWN" =
    input.appointmentLinked || tools.includes("book_appointment") || tools.includes("get_next_qualification_question") ? "YES" : "UNKNOWN";
  const hasContact = Boolean(input.lead?.phone || input.lead?.email);
  const followUpNeeded = hasContact || appointmentInterest === "YES";

  const topics = visitorLines.slice(0, 3);
  const minutes = Math.floor((input.durationSeconds ?? 0) / 60);
  const seconds = Math.round((input.durationSeconds ?? 0) % 60);
  const summaryText = input.vapiSummary
    ? sanitize(input.vapiSummary, 400)
    : `Visitor exchanged ${visitorLines.length} message${visitorLines.length === 1 ? "" : "s"} with the AI over ${minutes}m ${seconds}s.`;

  const when = input.startedAt
    ? new Date(input.startedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
    : "unknown";

  const lines: string[] = [
    "AI Voice Card Conversation",
    "",
    `Visitor: ${input.lead?.name ? sanitize(input.lead.name, 60) : "Anonymous visitor"}`,
    `Conversation time: ${when}`,
    `Language: ${input.language || "en"}`,
  ];
  if (topics.length > 0) {
    lines.push("", "Questions / topics:");
    for (const t of topics) lines.push(`- ${t}`);
  }
  lines.push("", `Summary: ${summaryText}`, "", `Visitor intent: ${intent}`, `Appointment interest: ${appointmentInterest}`, `Follow-up needed: ${followUpNeeded ? "YES" : "NO"}`);
  if (hasContact) {
    const contact = [input.lead?.phone && sanitize(input.lead.phone, 24), input.lead?.email && sanitize(input.lead.email, 80)]
      .filter(Boolean)
      .join(" · ");
    lines.push(`Contact (visitor-provided): ${contact}`);
  }

  const message = lines.join("\n").slice(0, 1200);
  return { message, intent, appointmentInterest, followUpNeeded, visitorLineCount: visitorLines.length };
}

export interface SummaryNotifierDeps {
  notifier: IWhatsAppNotifier;
  idempotency: IWhatsAppIdempotencyStore;
}

export interface SummaryNotifyResult {
  sent: boolean;
  reason?: string;
}

/** Sends the owner's conversation-summary WhatsApp. Never throws — the
 * webhook that calls this must succeed regardless of notification fate. */
export async function sendConversationSummaryToOwner(deps: SummaryNotifierDeps, input: ConversationSummaryInput): Promise<SummaryNotifyResult> {
  try {
    if (!deps.notifier.isConfigured()) return { sent: false, reason: "unconfigured" };
    if (!input.ownerPhone) return { sent: false, reason: "no_owner_phone" };

    const built = buildConversationSummaryMessage(input);
    // A call where the visitor never said anything (autoplay greeting, then
    // hang up) is not worth an owner ping — unless they left contact info.
    if (built.visitorLineCount === 0 && !input.lead?.phone && !input.lead?.email && !input.appointmentLinked) {
      return { sent: false, reason: "no_visitor_content" };
    }

    const { allowed } = await checkRateLimitDistributed(`conv-summary:${input.employeeId}`, 20, 3600_000);
    if (!allowed) {
      Logger.warn("WHATSAPP_NOTIFICATION_FAILED", { kind: "conversation_summary", reason: "rate_limited", conversationId: input.conversationId });
      return { sent: false, reason: "rate_limited" };
    }

    // Claim BEFORE sending: at-most-once is the right bias for an owner
    // notification (a duplicate alert is worse than a rare lost one, and
    // the failure is logged loudly either way).
    let firstDelivery: boolean;
    try {
      firstDelivery = await deps.idempotency.claimMessage(`conv-summary:${input.conversationId}`);
    } catch (err) {
      Logger.warn("WHATSAPP_NOTIFICATION_FAILED", {
        kind: "conversation_summary",
        reason: "idempotency_error",
        conversationId: input.conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { sent: false, reason: "idempotency_error" };
    }
    if (!firstDelivery) return { sent: false, reason: "duplicate" };

    const result = await deps.notifier.send(input.ownerPhone, built.message);
    if (result.sent) {
      Logger.info("WHATSAPP_NOTIFICATION_SENT", { kind: "conversation_summary", conversationId: input.conversationId, intent: built.intent });
    } else {
      Logger.warn("WHATSAPP_NOTIFICATION_FAILED", { kind: "conversation_summary", conversationId: input.conversationId, reason: result.reason });
    }
    return { sent: result.sent, reason: result.reason };
  } catch (err) {
    Logger.warn("WHATSAPP_NOTIFICATION_FAILED", {
      kind: "conversation_summary",
      conversationId: input.conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: false, reason: "error" };
  }
}
