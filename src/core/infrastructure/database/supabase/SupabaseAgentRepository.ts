import { AgentFilter, CreateAgentInput, IAgentRepository } from "@/core/domain/repositories/IAgentRepository";
import { AIAgent } from "@/core/domain/agent/AIAgent";
import { supabaseAdmin } from "@/shared/lib/supabase";

export class SupabaseAgentRepository implements IAgentRepository {
  async createAgent(data: CreateAgentInput): Promise<AIAgent> {
    const { data: agent, error } = await supabaseAdmin
      .from("ai_agents")
      .insert({
        company_id: data.company_id,
        employee_id: data.employee_id ?? null,
        department: data.department,
        name: data.name,
        avatar_url: data.avatar_url ?? null,
        voice_model_id: data.voice_model_id,
        personality_prompt: data.personality_prompt,
        first_message: data.first_message ?? null,
        welcome_message_language: data.welcome_message_language ?? "en",
        capabilities: data.capabilities ?? [],
        tools: data.tools ?? [],
        prompt_template_id: data.prompt_template_id ?? null,
        escalation_threshold: data.escalation_threshold ?? 0.7,
        status: "TESTING",
        is_active: false,
      })
      .select()
      .single();

    if (error) throw new Error(`SupabaseAgentRepository.createAgent failed: ${error.message}`);
    return agent as AIAgent;
  }

  async getAgentById(id: string): Promise<AIAgent | null> {
    const { data, error } = await supabaseAdmin.from("ai_agents").select().eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`SupabaseAgentRepository.getAgentById failed: ${error.message}`);
    return (data as AIAgent) || null;
  }

  async getAgentByEmployee(employeeId: string): Promise<AIAgent | null> {
    const { data, error } = await supabaseAdmin
      .from("ai_agents")
      .select()
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`SupabaseAgentRepository.getAgentByEmployee failed: ${error.message}`);
    return (data as AIAgent) || null;
  }

  async listAgents(filter: AgentFilter): Promise<{ agents: AIAgent[]; total: number }> {
    let query = supabaseAdmin
      .from("ai_agents")
      .select("*", { count: "exact" })
      .eq("company_id", filter.company_id)
      .is("deleted_at", null);

    if (filter.status) query = query.eq("status", filter.status);

    const limit = filter.limit || 20;
    const offset = filter.offset || 0;
    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`SupabaseAgentRepository.listAgents failed: ${error.message}`);
    return { agents: (data as AIAgent[]) || [], total: count || 0 };
  }

  async updateAgent(id: string, data: Partial<CreateAgentInput>): Promise<AIAgent> {
    const { data: agent, error } = await supabaseAdmin.from("ai_agents").update(data).eq("id", id).select().single();
    if (error) throw new Error(`SupabaseAgentRepository.updateAgent failed: ${error.message}`);
    return agent as AIAgent;
  }

  async updateAgentStatus(id: string, status: AIAgent["status"]): Promise<AIAgent> {
    const { data, error } = await supabaseAdmin
      .from("ai_agents")
      .update({ status, is_active: status === "ACTIVE" })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`SupabaseAgentRepository.updateAgentStatus failed: ${error.message}`);
    return data as AIAgent;
  }

  async softDeleteAgent(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from("ai_agents")
      .update({ deleted_at: new Date().toISOString(), status: "INACTIVE", is_active: false })
      .eq("id", id);
    if (error) throw new Error(`SupabaseAgentRepository.softDeleteAgent failed: ${error.message}`);
    return true;
  }

  async assignKnowledgeDocuments(agentId: string, knowledgeDocumentIds: string[]): Promise<void> {
    const { error: deleteError } = await supabaseAdmin.from("agent_knowledge_documents").delete().eq("agent_id", agentId);
    if (deleteError) throw new Error(`SupabaseAgentRepository.assignKnowledgeDocuments failed: ${deleteError.message}`);

    if (knowledgeDocumentIds.length === 0) return;

    const { error: insertError } = await supabaseAdmin
      .from("agent_knowledge_documents")
      .insert(knowledgeDocumentIds.map((knowledge_document_id) => ({ agent_id: agentId, knowledge_document_id })));

    if (insertError) throw new Error(`SupabaseAgentRepository.assignKnowledgeDocuments failed: ${insertError.message}`);
  }

  async getAssignedKnowledgeDocumentIds(agentId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin.from("agent_knowledge_documents").select("knowledge_document_id").eq("agent_id", agentId);
    if (error) throw new Error(`SupabaseAgentRepository.getAssignedKnowledgeDocumentIds failed: ${error.message}`);
    return (data || []).map((row) => row.knowledge_document_id as string);
  }

  async recordTestRun(id: string): Promise<AIAgent> {
    const { data, error } = await supabaseAdmin
      .from("ai_agents")
      .update({ last_tested_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`SupabaseAgentRepository.recordTestRun failed: ${error.message}`);
    return data as AIAgent;
  }
}
