import { z } from "zod";

// Base Audit Entity Interface
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Enum Definitions
export enum LeadStatus {
  NEW = "NEW",
  QUALIFIED = "QUALIFIED",
  DISQUALIFIED = "DISQUALIFIED",
  CONTACTED = "CONTACTED",
  BOOKED = "BOOKED",
}

export enum LeadScoreCategory {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum ConversationStatus {
  ACTIVE = "ACTIVE",
  ENDED = "ENDED",
  SUMMARIZED = "SUMMARIZED",
  FAILED = "FAILED",
}

export enum AppointmentStatus {
  BOOKED = "BOOKED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
}

// ----------------------------------------------------
// Entity Interfaces
// ----------------------------------------------------

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  is_platform_admin: boolean;
  created_at: string;
  updated_at: string;
}

export type CompanyMemberStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

export interface CompanyMember extends BaseEntity {
  company_id: string;
  user_id: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE" | "VIEWER";
  status: CompanyMemberStatus;
  invited_by?: string | null;
  invited_at: string;
  joined_at?: string | null;
}

export interface Company extends BaseEntity {
  name: string;
  website: string;
  logo_url?: string | null;
  settings?: Record<string, unknown>;
}

export interface Employee extends BaseEntity {
  company_id: string;
  user_id?: string | null;
  name: string;
  designation: string;
  phone: string;
  email: string;
  office_address?: string | null;
  working_hours?: string | null;
  social_links?: Record<string, string> | null;
  vapi_agent_id?: string | null;
}

export interface Product extends BaseEntity {
  company_id: string;
  name: string;
  description: string;
  features: string[];
  benefits: string[];
  pricing: number;
  currency: string;
  target_audience?: string | null;
}

export interface Service extends BaseEntity {
  company_id: string;
  name: string;
  description: string;
  deliverables: string[];
  timeline: string;
  price: number;
  optional_addons?: Array<{ name: string; price: number }> | null;
}

export interface FAQ extends BaseEntity {
  company_id: string;
  category: string;
  question: string;
  answer: string;
}

export interface LeadScoringRule extends BaseEntity {
  company_id: string;
  factor_name: string;
  weight: number;
  condition_operator: "EQUALS" | "CONTAINS" | "GREATER_THAN" | "LESS_THAN";
  condition_value: string;
}

export interface Lead extends BaseEntity {
  company_id: string;
  employee_id: string;
  conversation_id?: string | null;
  name: string;
  email: string;
  phone: string;
  business_name?: string | null;
  industry?: string | null;
  problem_statement?: string | null;
  budget?: number | null;
  timeline?: string | null;
  score: number;
  score_category: LeadScoreCategory;
  score_reasoning?: string | null;
  status: LeadStatus;
  owner_id?: string | null;
  tags: string[];
}

export interface Conversation extends BaseEntity {
  company_id: string;
  employee_id: string;
  vapi_call_id?: string | null;
  status: ConversationStatus;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  summary?: string | null;
  sentiment?: string | null;
  intent?: string | null;
  tools_called: string[];
  lead_score?: number | null;
  transcript?: string | null;
  audio_metadata: Record<string, unknown>;
  appointment_id?: string | null;
}

export interface ConversationMessage extends BaseEntity {
  conversation_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Record<string, unknown> | null;
}

export interface Appointment extends BaseEntity {
  company_id: string;
  employee_id: string;
  lead_id: string;
  calcom_booking_id?: string | null;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  meeting_url?: string | null;
  timezone: string;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  rescheduled_from_id?: string | null;
  notes?: string | null;
}

export interface PromptTemplate extends BaseEntity {
  company_id: string;
  module_name: "identity" | "behavior" | "sales" | "knowledge" | "security" | "booking" | "qualification" | "fallback";
  template_content: string;
  version: number;
  is_active: boolean;
}

export type LeadActivityType = "NOTE" | "STATUS_CHANGE" | "CALL" | "EMAIL" | "APPOINTMENT" | "OWNER_CHANGE";

export interface LeadActivity {
  id: string;
  lead_id: string;
  company_id: string;
  type: LeadActivityType;
  content?: string | null;
  actor_user_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export type KnowledgeSourceType = "PDF" | "DOCX" | "TXT" | "MARKDOWN";
export type KnowledgeStatus = "PENDING" | "CHUNKING" | "EMBEDDING" | "READY" | "FAILED";

export interface KnowledgeDocument extends BaseEntity {
  company_id: string;
  title: string;
  source_type: KnowledgeSourceType;
  storage_path: string;
  file_size_bytes?: number | null;
  status: KnowledgeStatus;
  chunk_count: number;
  error_message?: string | null;
  uploaded_by?: string | null;
}

export interface KnowledgeChunk {
  id: string;
  knowledge_document_id: string;
  company_id: string;
  chunk_index: number;
  content: string;
  token_count?: number | null;
  created_at: string;
  similarity?: number;
}

export interface PromptTemplateVersion {
  id: string;
  prompt_template_id: string;
  version: number;
  content: string;
  created_by?: string | null;
  created_at: string;
}

export interface Branding extends BaseEntity {
  company_id: string;
  logo_storage_path?: string | null;
  primary_color: string;
  secondary_color: string;
  font_family: string;
}

export interface Settings extends BaseEntity {
  company_id: string;
  business_info: Record<string, unknown>;
  calendar_settings: Record<string, unknown>;
  email_settings: Record<string, unknown>;
  voice_settings: Record<string, unknown>;
}

export interface ApiKeyRecord {
  id: string;
  company_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_by?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
}

export type EmailStatus = "QUEUED" | "SENT" | "FAILED" | "BOUNCED";

export interface EmailLog {
  id: string;
  company_id?: string | null;
  to_email: string;
  subject: string;
  template_name?: string | null;
  status: EmailStatus;
  provider_message_id?: string | null;
  error_message?: string | null;
  attempt_count: number;
  sent_at?: string | null;
  created_at: string;
}

export interface AuditLog extends BaseEntity {
  company_id?: string | null;
  user_id?: string | null;
  action: string;
  entity_name: string;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
}

// ----------------------------------------------------
// Zod Validation Schemas
// ----------------------------------------------------

export const CreateLeadSchema = z.object({
  company_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  conversation_id: z.string().uuid().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(5),
  business_name: z.string().optional(),
  industry: z.string().optional(),
  problem_statement: z.string().optional(),
  budget: z.number().optional(),
  timeline: z.string().optional(),
});

export type CreateLeadDTO = z.infer<typeof CreateLeadSchema>;

export const CreateAppointmentSchema = z.object({
  company_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  calcom_booking_id: z.string().optional(),
  meeting_url: z.string().url().optional(),
});

export const CreateProductSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().min(5),
  features: z.array(z.string()),
  benefits: z.array(z.string()),
  pricing: z.number().nonnegative(),
  currency: z.string().default("USD"),
  target_audience: z.string().optional(),
});

export const CreateFAQSchema = z.object({
  company_id: z.string().uuid(),
  category: z.string().min(2),
  question: z.string().min(5),
  answer: z.string().min(2),
});
