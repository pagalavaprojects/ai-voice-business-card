import { BaseEntity } from "../models/types";

export type AgentDepartment =
  | "SALES"
  | "TECHNICAL_SUPPORT"
  | "RECRUITER"
  | "CUSTOMER_SUCCESS"
  | "SUPERVISOR";

export type AgentStatus = "ACTIVE" | "INACTIVE" | "TESTING";

export interface AIAgent extends BaseEntity {
  company_id: string;
  employee_id?: string | null;
  department: AgentDepartment;
  name: string;
  avatar_url?: string | null;
  voice_model_id: string;
  personality_prompt: string;
  capabilities: string[];
  tools: string[];
  prompt_template_id?: string | null;
  escalation_threshold: number;
  is_active: boolean;
  status: AgentStatus;
  last_tested_at?: string | null;
}

export interface IntentRoutingResult {
  selectedAgent: AIAgent;
  confidenceScore: number;
  reasoning: string;
  requiresHumanEscalation: boolean;
}
