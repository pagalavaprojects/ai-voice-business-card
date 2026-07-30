import { Conversation, ConversationMessage } from "../models/types";

export interface IConversationRepository {
  createConversation(companyId: string, employeeId: string, vapiCallId?: string): Promise<Conversation>;
  getConversationById(id: string): Promise<Conversation | null>;
  addMessage(conversationId: string, role: "system" | "user" | "assistant" | "tool", content: string, toolCalls?: Record<string, unknown>): Promise<ConversationMessage>;
  getMessages(conversationId: string): Promise<ConversationMessage[]>;
  endConversation(id: string, durationSeconds: number, summary?: string): Promise<Conversation>;
}
