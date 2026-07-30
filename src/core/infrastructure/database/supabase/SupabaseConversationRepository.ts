import { IConversationRepository } from "@/core/domain/repositories/IConversationRepository";
import { Conversation, ConversationMessage } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

export class SupabaseConversationRepository implements IConversationRepository {
  async createConversation(companyId: string, employeeId: string, vapiCallId?: string): Promise<Conversation> {
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        company_id: companyId,
        employee_id: employeeId,
        vapi_call_id: vapiCallId,
        status: "ACTIVE",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`createConversation failed: ${error.message}`);
    return data as Conversation;
  }

  async getConversationById(id: string): Promise<Conversation | null> {
    const { data, error } = await supabaseAdmin.from("conversations").select().eq("id", id).single();
    if (error && error.code !== "PGRST116") throw new Error(`getConversationById failed: ${error.message}`);
    return (data as Conversation) || null;
  }

  async addMessage(
    conversationId: string,
    role: "system" | "user" | "assistant" | "tool",
    content: string,
    toolCalls?: Record<string, unknown>
  ): Promise<ConversationMessage> {
    const { data, error } = await supabaseAdmin
      .from("conversation_messages")
      .insert({
        conversation_id: conversationId,
        role,
        content,
        tool_calls: toolCalls,
      })
      .select()
      .single();

    if (error) throw new Error(`addMessage failed: ${error.message}`);
    return data as ConversationMessage;
  }

  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    const { data, error } = await supabaseAdmin
      .from("conversation_messages")
      .select()
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`getMessages failed: ${error.message}`);
    return (data as ConversationMessage[]) || [];
  }

  async endConversation(id: string, durationSeconds: number, summary?: string): Promise<Conversation> {
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .update({
        status: "SUMMARIZED",
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        summary,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`endConversation failed: ${error.message}`);
    return data as Conversation;
  }
}
