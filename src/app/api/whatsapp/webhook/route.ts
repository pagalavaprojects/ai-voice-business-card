import { NextRequest, NextResponse } from "next/server";
import { formatApiResponse, isPlaceholderCredential, validateWhatsAppWebhookSignature } from "@/shared/lib/security";
import { SupabaseConversationRepository } from "@/core/infrastructure/database/supabase/SupabaseConversationRepository";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { SupabaseWhatsAppIdempotencyStore } from "@/core/infrastructure/notifications/WhatsAppIdempotency";
import { SupabaseWhatsAppConversationLock } from "@/core/infrastructure/notifications/WhatsAppConversationLock";
import { getWhatsAppNotifier } from "@/core/infrastructure/notifications/WhatsAppNotifier";
import { WhatsAppQualificationChannel } from "@/core/application/services/WhatsAppQualificationChannel";
import { toolRegistry } from "@/core/infrastructure/bootstrap/assistantRuntime";
import { resolvePublicBaseUrl } from "@/shared/lib/publicUrl";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";
import { Logger } from "@/shared/lib/logger";

// Reads headers/query params on every request — must never be statically
// rendered/cached, same rule as every other webhook route in this app.
export const dynamic = "force-dynamic";

const conversationRepo = new SupabaseConversationRepository();
const knowledgeRepo = new SupabaseKnowledgeRepository();
const idempotencyStore = new SupabaseWhatsAppIdempotencyStore();
const senderLock = new SupabaseWhatsAppConversationLock();
const channel = new WhatsAppQualificationChannel(toolRegistry, conversationRepo, getWhatsAppNotifier());

interface MetaWebhookMessage {
  from: string;
  id: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

interface MetaWebhookValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: MetaWebhookMessage[];
  statuses?: unknown[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: MetaWebhookValue }> }>;
}

/**
 * Meta's one-time webhook verification handshake (configured once in
 * Meta's App Dashboard -> WhatsApp -> Configuration -> Webhook). Meta calls
 * this with hub.mode=subscribe and the verify token it was configured
 * with; echoing hub.challenge back proves this endpoint is the one that
 * should receive future deliveries.
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (isPlaceholderCredential(expected)) {
    Logger.warn("WhatsApp webhook verification attempted with no WHATSAPP_VERIFY_TOKEN configured");
    return new NextResponse("Verification not configured", { status: 403 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Verification failed", { status: 403 });
}

export async function POST(req: NextRequest) {
  // Captured as raw text (not req.json()) because the signature is computed
  // over the exact bytes Meta sent — re-serializing the parsed object can
  // differ in key order/whitespace and silently fail verification.
  const rawBody = await req.text();

  if (!validateWhatsAppWebhookSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    Logger.warn("WhatsApp webhook rejected: invalid signature");
    return formatApiResponse(null, 401, "Unauthorized: invalid signature", ["Invalid signature"]);
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return formatApiResponse(null, 400, "Malformed JSON payload");
  }

  if (payload.object !== "whatsapp_business_account") {
    // Not a WhatsApp event this endpoint understands — acknowledge without
    // processing rather than erroring on a shape Meta may add later.
    return formatApiResponse({ status: "ignored" }, 200, "Event type not processed");
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      // Delivery/read receipts arrive on the same webhook as inbound
      // messages, distinguished by `field` — never qualification input.
      if (change.field !== "messages" || !change.value?.messages?.length) continue;

      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const employee = await knowledgeRepo.getEmployeeByWhatsAppPhoneNumberId(phoneNumberId);
      if (!employee) {
        Logger.warn("WhatsApp webhook: no employee configured for receiving phone_number_id", { phoneNumberId });
        continue;
      }

      for (const message of value.messages ?? []) {
        if (message.type !== "text" || !message.text?.body) {
          // Non-text messages (images, audio, reactions, ...) are outside
          // this MVP's scope — acknowledged, not processed, not an error.
          continue;
        }

        const waId = message.from;
        const { allowed } = await checkRateLimitDistributed(`whatsapp-inbound:${waId}`, 30, 60_000);
        if (!allowed) {
          Logger.warn("WhatsApp webhook: rate limit exceeded", { waId });
          continue;
        }

        // Idempotency FIRST: an insert-or-conflict on the message id, race-
        // safe against a genuinely concurrent duplicate delivery in a way a
        // read-then-write check would not be. Failure here (not a
        // duplicate — a real DB error) is the one case worth surfacing as a
        // 500 so Meta retries, since we cannot be sure whether this message
        // was claimed.
        let firstDelivery: boolean;
        try {
          firstDelivery = await idempotencyStore.claimMessage(message.id);
        } catch (err) {
          Logger.error("WhatsApp webhook: idempotency claim failed", { error: err instanceof Error ? err.message : String(err) });
          return formatApiResponse(null, 500, "Idempotency check failed");
        }
        if (!firstDelivery) {
          Logger.info("WhatsApp webhook: duplicate delivery skipped", { messageId: message.id });
          continue;
        }

        const locked = await senderLock.tryAcquire(waId);
        if (!locked) {
          // Another message from this exact sender is being processed
          // right now — dropped, not queued (see WhatsAppConversationLock's
          // own doc comment for why this is the correct outcome here).
          Logger.warn("WhatsApp webhook: sender already being processed, message dropped", { waId, messageId: message.id });
          continue;
        }

        try {
          const baseUrl = resolvePublicBaseUrl(req.nextUrl.origin);
          const bookingUrl = baseUrl ? `${baseUrl}${employee.slug ? `/c/${employee.slug}` : `/${employee.company_id}/${employee.id}`}` : undefined;

          await channel.handleInboundMessage({
            companyId: employee.company_id,
            employeeId: employee.id,
            waId,
            text: message.text.body,
            bookingUrl,
          });
        } catch (err) {
          // Logged loudly but still acknowledged (200) rather than left to
          // retry: the message id is already claimed, so a Meta retry would
          // just be silently swallowed by the idempotency check above and
          // never actually reprocessed anyway — better to fail loud once
          // than retry into a guaranteed no-op.
          Logger.error("WhatsApp qualification channel threw while handling an inbound message", {
            error: err instanceof Error ? err.message : String(err),
            waId,
            messageId: message.id,
          });
        } finally {
          await senderLock.release(waId);
        }
      }
    }
  }

  return formatApiResponse({ status: "processed" }, 200, "Webhook processed");
}
