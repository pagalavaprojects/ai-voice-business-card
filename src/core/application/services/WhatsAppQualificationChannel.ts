import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { IConversationRepository } from "@/core/domain/repositories/IConversationRepository";
import { IWhatsAppNotifier } from "@/core/infrastructure/notifications/WhatsAppNotifier";
import { Logger } from "@/shared/lib/logger";
import { getQualificationCallOpening, isQualificationSupportedLanguage, type QualificationLanguage } from "@/features/voice/lib/qualificationScript";

/**
 * The thin WhatsApp adapter Phase 4 asks for. It owns NOTHING about
 * questions, classification, sequencing, or persistence — every one of
 * those already exists in get_next_qualification_question (built and
 * tested for the voice channel) and is called here exactly as the Vapi
 * webhook calls it. The only things this file adds are the two pieces a
 * live voice call gets for free from having an LLM holding conversational
 * context, and a stateless HTTP webhook does not:
 *
 * 1. Which question is currently pending an answer (conversations.
 *    whatsapp_pending_question) — a live call's model just remembers this;
 *    a fresh webhook request each time has nothing else to hold it.
 * 2. A short language-selection step before Q1, since WhatsApp has no
 *    language selector UI the way the website card does.
 *
 * Classification, sequencing, persistence, and lead resolution all still
 * flow through the SAME get_next_qualification_question tool used by
 * voice — this file never decides YES/NO/MAYBE and never invents a
 * question.
 */

const LANGUAGE_PROMPT = "வணக்கம்! தமிழ் அல்லது English-ல் தொடர விரும்புகிறீர்களா?\n\nReply Tamil or English to continue.";

function parseLanguageSelection(text: string): QualificationLanguage | null {
  const t = text.trim().toLowerCase();
  if (t.includes("தமிழ்") || t.includes("tamil") || t === "1") return "ta";
  if (t.includes("english") || t === "2") return "en";
  return null;
}

export interface WhatsAppInboundMessage {
  companyId: string;
  employeeId: string;
  waId: string; // sender's stable WhatsApp identity
  text: string; // raw message body, exactly as the visitor typed it
  /** The visitor's own card URL, when the caller can cheaply resolve one
   * (base URL + employee slug) — included in the completion message so
   * the visitor can reach the EXISTING booking flow (slot selection,
   * Your Details, confirmation) rather than this adapter inventing a
   * second one. Omitted entirely when unavailable, never a broken link. */
  bookingUrl?: string;
}

export class WhatsAppQualificationChannel {
  constructor(
    private toolRegistry: ToolRegistry,
    private conversationRepo: IConversationRepository,
    private notifier: IWhatsAppNotifier
  ) {}

  async handleInboundMessage(msg: WhatsAppInboundMessage): Promise<void> {
    const conversation = await this.conversationRepo.getOrCreateConversationByWhatsAppSender(msg.companyId, msg.employeeId, msg.waId);

    // Step 1: no language yet — this message IS (or should be) the
    // language choice, never a qualification answer.
    if (!isQualificationSupportedLanguage(conversation.language ?? undefined)) {
      const chosen = parseLanguageSelection(msg.text);
      if (!chosen) {
        await this.send(msg.waId, LANGUAGE_PROMPT);
        return;
      }
      // language is only ever set once, on the row the get-or-create call
      // above just created or found — a second inbound message for an
      // already-created-but-still-unset-language conversation needs its
      // own update, since getOrCreateConversationByWhatsAppSender's
      // language param only applies at INSERT time.
      await this.conversationRepo.setConversationLanguage(conversation.id, chosen);
      const opening = getQualificationCallOpening(chosen);
      await this.send(msg.waId, opening);
      await this.conversationRepo.setWhatsAppPendingQuestion(conversation.id, 1);
      return;
    }

    const language = conversation.language as QualificationLanguage;
    const pending = conversation.whatsapp_pending_question;

    if (!pending) {
      // Language is known but no question has been sent yet (defensive —
      // should be unreachable given the branch above always sets pending
      // to 1 right after sending Q1, but a stateless webhook must never
      // assume a prior write actually landed).
      const opening = getQualificationCallOpening(language);
      await this.send(msg.waId, opening);
      await this.conversationRepo.setWhatsAppPendingQuestion(conversation.id, 1);
      return;
    }

    const tool = this.toolRegistry.getTool("get_next_qualification_question");
    if (!tool) {
      Logger.error("WhatsApp qualification: get_next_qualification_question tool not registered");
      return;
    }

    const result = await tool.execute(
      { last_answered_question: pending, user_response: msg.text },
      { companyId: msg.companyId, employeeId: msg.employeeId, conversationId: conversation.id, language }
    );

    switch (result.action) {
      case "reprompt":
        // Invalid answer — nothing persisted, nothing advances. Re-send
        // the exact guidance the tool returned; pending stays unchanged.
        await this.send(msg.waId, String(result.speak ?? ""));
        return;
      case "ask_verbatim":
        await this.send(msg.waId, String(result.speak ?? ""));
        await this.conversationRepo.setWhatsAppPendingQuestion(conversation.id, Number(result.question_number));
        return;
      case "complete_proceed_to_booking": {
        // Directs the visitor to the EXISTING booking flow (slot
        // selection -> Your Details -> confirmation) instead of building a
        // second booking system inside WhatsApp — exactly what Phase 11
        // requires. No link is fabricated when one can't be resolved.
        const linkLine = msg.bookingUrl
          ? language === "ta"
            ? `\n\nஒரு நேரத்தைப் பதிவு செய்ய: ${msg.bookingUrl}`
            : `\n\nBook a time here: ${msg.bookingUrl}`
          : "";
        await this.send(
          msg.waId,
          (language === "ta"
            ? "நன்றி! உங்கள் தகுதி மதிப்பீடு முடிந்தது."
            : "Thank you! Your qualification is complete.") + linkLine
        );
        await this.conversationRepo.setWhatsAppPendingQuestion(conversation.id, null);
        return;
      }
      default:
        // "error"/"freeform" — language is always ta/en here, so this
        // branch is defensive only; log and stay on the same question
        // rather than silently dropping the visitor's message.
        Logger.warn("WhatsApp qualification: unexpected tool action", { action: result.action });
        return;
    }
  }

  private async send(waId: string, body: string): Promise<void> {
    const result = await this.notifier.send(waId, body);
    if (!result.sent) {
      Logger.warn("WhatsApp qualification: outbound send failed", { reason: result.reason });
    }
  }
}
