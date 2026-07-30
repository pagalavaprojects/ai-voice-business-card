import { AIAgent } from "../agent/AIAgent";

export interface AgentFilter {
  company_id: string;
  status?: AIAgent["status"];
  limit?: number;
  offset?: number;
}

export interface CreateAgentInput {
  company_id: string;
  employee_id?: string | null;
  department: AIAgent["department"];
  name: string;
  avatar_url?: string | null;
  voice_model_id: string;
  personality_prompt: string;
  capabilities?: string[];
  tools?: string[];
  prompt_template_id?: string | null;
  escalation_threshold?: number;
}

export interface AgentReadiness {
  ready: boolean;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
}

export interface IAgentRepository {
  createAgent(data: CreateAgentInput): Promise<AIAgent>;
  getAgentById(id: string): Promise<AIAgent | null>;
  listAgents(filter: AgentFilter): Promise<{ agents: AIAgent[]; total: number }>;
  updateAgent(id: string, data: Partial<CreateAgentInput>): Promise<AIAgent>;
  updateAgentStatus(id: string, status: AIAgent["status"]): Promise<AIAgent>;
  softDeleteAgent(id: string): Promise<boolean>;
  assignKnowledgeDocuments(agentId: string, knowledgeDocumentIds: string[]): Promise<void>;
  getAssignedKnowledgeDocumentIds(agentId: string): Promise<string[]>;
  recordTestRun(id: string): Promise<AIAgent>;
}
