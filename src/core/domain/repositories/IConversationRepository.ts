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
  createConversation(companyId: string, employeeId: string, vapiCallId?: string): Promise<Conversation>;
  getConversationById(id: string): Promise<Conversation | null>;
  /** The Vapi webhook fires multiple stateless requests for the same call
   * (assistant-request, tool-calls, end-of-call-report); this is how they
   * all resolve to the same conversation row instead of creating one per
   * event. */
  getOrCreateConversationByVapiCallId(companyId: string, employeeId: string, vapiCallId: string): Promise<Conversation>;
  appendToolCalled(id: string, toolName: string): Promise<Conversation>;
  addMessage(conversationId: string, role: "system" | "user" | "assistant" | "tool", content: string, toolCalls?: Record<string, unknown>): Promise<ConversationMessage>;
  getMessages(conversationId: string): Promise<ConversationMessage[]>;
  endConversation(id: string, data: EndConversationData): Promise<Conversation>;
}
