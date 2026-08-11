import { Conversation, ConversationMessage } from "../models/types";

export interface EndConversationData {
  durationSeconds: number;
  summary?: string;
  sentiment?: string;
  transcript?: string;
  intent?: string;
  toolsCalled?: string[];
  leadScore?: number;
  appointmentId?: string;
  audioMetadata?: Record<string, unknown>;
}

export interface IConversationRepository {
  createConversation(companyId: string, employeeId: string, vapiCallId?: string, language?: string): Promise<Conversation>;
  getConversationById(id: string): Promise<Conversation | null>;
  /** The Vapi webhook fires multiple stateless requests for the same call
   * (assistant-request, tool-calls, end-of-call-report); this is how they
   * all resolve to the same conversation row instead of creating one per
   * event. `language` is only applied on first creation — later calls for
   * an already-existing conversation don't overwrite it. */
  getOrCreateConversationByVapiCallId(companyId: string, employeeId: string, vapiCallId: string, language?: string): Promise<Conversation>;
  /** The WhatsApp analogue of getOrCreateConversationByVapiCallId — a
   * WhatsApp conversation spans many separate webhook requests over
   * many messages/days (not one call), so every inbound message looks
   * this up by the sender's stable wa_id. `language` is only applied
   * on first creation, same rule as the Vapi method. */
  getOrCreateConversationByWhatsAppSender(companyId: string, employeeId: string, waId: string, language?: string): Promise<Conversation>;
  /** Persists which authored question this WhatsApp conversation is
   * currently waiting on an answer for — the one piece of state a live
   * voice call's LLM holds in its own context that a stateless webhook
   * has nothing else to hold. Pass null to clear it (qualification
   * complete / not yet started). */
  setWhatsAppPendingQuestion(id: string, questionNumber: number | null): Promise<Conversation>;
  /** Sets the language on an ALREADY-created conversation — needed only by
   * WhatsApp, where a conversation row is created before its language is
   * known (the visitor's first message is a greeting, not a language
   * choice). Voice never needs this: language is always resolved from the
   * ?lang= query param and passed at creation time. */
  setConversationLanguage(id: string, language: string): Promise<Conversation>;
  appendToolCalled(id: string, toolName: string): Promise<Conversation>;
  addMessage(conversationId: string, role: "system" | "user" | "assistant" | "tool", content: string, toolCalls?: Record<string, unknown>): Promise<ConversationMessage>;
  getMessages(conversationId: string): Promise<ConversationMessage[]>;
  endConversation(id: string, data: EndConversationData): Promise<Conversation>;
}
