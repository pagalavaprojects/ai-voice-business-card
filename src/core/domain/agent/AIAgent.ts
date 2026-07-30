import { BaseEntity } from "../models/types";

export type AgentDepartment =
  | "SALES"
  | "TECHNICAL_SUPPORT"
  | "RECRUITER"
  | "CUSTOMER_SUCCESS"
  | "SUPERVISOR";

export interface AIAgent extends BaseEntity {
  company_id: string;
  department: AgentDepartment;
  name: string;
  avatar_url?: string | null;
  voice_model_id: string;
  personality_prompt: string;
  capabilities: string[];
  escalation_threshold: number;
  is_active: boolean;
}

export interface IntentRoutingResult {
  selectedAgent: AIAgent;
  confidenceScore: number;
  reasoning: string;
  requiresHumanEscalation: boolean;
}
