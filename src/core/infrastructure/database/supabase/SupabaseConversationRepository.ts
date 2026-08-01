import { EndConversationData, IConversationRepository } from "@/core/domain/repositories/IConversationRepository";
import { Conversation, ConversationMessage } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

/**
 * Coerces a value destined for an INT column. Postgres rejects a float
 * outright ("invalid input syntax for type integer: 19.488") rather than
 * truncating, so rounding has to happen before the write. Returns null for
 * absent or non-finite input so the column stays NULL instead of the update
 * failing — a missing duration is worth far less than losing the transcript,
 * summary and tool history that travel with it.
 */
function toIntOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

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

  async getOrCreateConversationByVapiCallId(companyId: string, employeeId: string, vapiCallId: string): Promise<Conversation> {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("conversations")
      .select()
      .eq("vapi_call_id", vapiCallId)
      .maybeSingle();

    if (lookupError) throw new Error(`getOrCreateConversationByVapiCallId failed: ${lookupError.message}`);
    if (existing) return existing as Conversation;

    return this.createConversation(companyId, employeeId, vapiCallId);
  }

  async appendToolCalled(id: string, toolName: string): Promise<Conversation> {
    const conversation = await this.getConversationById(id);
    if (!conversation) throw new Error(`appendToolCalled failed: conversation ${id} not found`);

    const existing = conversation.tools_called || [];
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .update({ tools_called: [...existing, toolName] })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`appendToolCalled failed: ${error.message}`);
    return data as Conversation;
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

  async endConversation(id: string, data: EndConversationData): Promise<Conversation> {
    const { data: row, error } = await supabaseAdmin
      .from("conversations")
      .update({
        status: "SUMMARIZED",
        ended_at: new Date().toISOString(),
        // duration_seconds and lead_score are INT columns, but callers receive
        // these from third parties as arbitrary numbers — Vapi reports call
        // duration as a float (e.g. 19.488), which Postgres rejects outright
        // with `invalid input syntax for type integer`. That failure took down
        // the whole end-of-call report in production: no transcript, no
        // summary, no duration, no tools_called persisted.
        //
        // Rounded here at the repository boundary rather than in the webhook,
        // because this is where the integer column contract actually lives —
        // fixing it in one caller would leave every other caller exposed.
        duration_seconds: toIntOrNull(data.durationSeconds),
        summary: data.summary,
        sentiment: data.sentiment,
        transcript: data.transcript,
        intent: data.intent,
        ...(data.toolsCalled && { tools_called: data.toolsCalled }),
        lead_score: toIntOrNull(data.leadScore),
        appointment_id: data.appointmentId,
        audio_metadata: data.audioMetadata || {},
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`endConversation failed: ${error.message}`);
    return row as Conversation;
  }
}
