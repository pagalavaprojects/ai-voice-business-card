import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { IConversationRepository } from "@/core/domain/repositories/IConversationRepository";
import { IWhatsAppNotifier } from "@/core/infrastructure/notifications/WhatsAppNotifier";
import { Logger } from "@/shared/lib/logger";
import { QUALIFICATION_CALL_OPENING } from "@/features/voice/lib/qualificationScript";

/**
 * The thin WhatsApp adapter Phase 4 asks for. It owns NOTHING about
 * questions, classification, sequencing, or persistence — every one of
 * those already exists in get_next_qualification_question (built and
 * tested for the voice channel) and is called here exactly as the Vapi
 * webhook calls it. The only thing this file adds is state a live voice
 * call gets for free from having an LLM holding conversational context,
 * and a stateless HTTP webhook does not: which question is currently
 * pending an answer (conversations.whatsapp_pending_question).
 *
 * The qualification script is English-only by product decision (no
 * language-selection step — WhatsApp proceeds directly into question 1 on
 * first contact). Classification, sequencing, persistence, and lead
 * resolution all still flow through the SAME get_next_qualification_
 * question tool used by voice — this file never decides YES/NO/MAYBE and
 * never invents a question.
 */

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
    const conversation = await this.conversationRepo.getOrCreateConversationByWhatsAppSender(msg.companyId, msg.employeeId, msg.waId, "en");
    const pending = conversation.whatsapp_pending_question;

    if (!pending) {
      // First contact from this sender (or a fresh conversation after a
      // prior one completed) — proceed directly into question 1, exactly
      // as the voice call's opening does. No generic "how can I help you?"
      // greeting and no language-selection step: the qualification script
      // is English-only regardless of the sender's own language.
      await this.send(msg.waId, QUALIFICATION_CALL_OPENING);
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
      { companyId: msg.companyId, employeeId: msg.employeeId, conversationId: conversation.id }
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
        // second booking system inside WhatsApp. No link is fabricated
        // when one can't be resolved.
        const linkLine = msg.bookingUrl ? `\n\nBook a time here: ${msg.bookingUrl}` : "";
        await this.send(msg.waId, "Thank you! Your qualification is complete." + linkLine);
        await this.conversationRepo.setWhatsAppPendingQuestion(conversation.id, null);
        return;
      }
      default:
        // "error" — defensive only; log and stay on the same question
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
