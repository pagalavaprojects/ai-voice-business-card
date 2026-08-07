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
  first_message?: string | null;
  /** BCP-47-ish tag ("en", "ta", "hi", ...) naming what language
   * first_message is written in. Vapi speaks whatever text is in
   * first_message regardless of this value — it carries no runtime
   * behavior — but it's what lets an admin (or a future language picker)
   * know what they're editing/swapping without having to read the script
   * itself, and lets a multilingual greeting rotate later by changing data,
   * never code. */
  welcome_message_language?: string | null;
  /** Per-language greeting overrides, e.g. { "ta": "வணக்கம்...", "en":
   * "Hello..." } — a company's own authored pitch in each language it
   * supports. A language with no entry here falls back to the platform's
   * generic default greeting for that language (see
   * features/language/greetings.ts), never to a blank/missing greeting. */
  greetings?: Record<string, string> | null;
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
