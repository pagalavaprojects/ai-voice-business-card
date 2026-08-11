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
  /** Captured from the visitor, but NOT confirmed on a calendar — Cal.com was
   * unconfigured or unreachable. A human still has to confirm it. Kept
   * distinct from BOOKED so nothing downstream mistakes an intention for an
   * actual calendar entry. */
  REQUESTED = "REQUESTED",
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
  /** Per-employee overrides below are nullable on purpose: NULL means
   * "inherit the company default". Storing a copy of the company value would
   * silently stop tracking later changes to it. */
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
  is_active: boolean;
  avatar_path?: string | null;
  voice_id?: string | null;
  prompt_override?: string | null;
  timezone?: string | null;
  display_order: number;
  /** Short public URL slug, e.g. "srinivasan" for /c/srinivasan. Globally
   * unique across every tenant — unlike product/service slugs, which are only
   * unique per company, this one lives in a single flat public namespace, so
   * two companies cannot both claim /c/founder. NULL means the card is only
   * reachable at its long-form /{companyId}/{employeeId} URL. */
  slug?: string | null;
  deleted_at?: string | null;
  /** The Meta WhatsApp Business phone_number_id that RECEIVES inbound
   * messages for this employee's qualification bot. Meta's webhook is one
   * URL per WhatsApp Business Account with no per-tenant path, so this is
   * the only signal on an inbound message that identifies which employee's
   * flow should handle it. Configured from Meta's API Setup page — see
   * WHATSAPP_ACCESS_TOKEN's own doc comment for where that lives. */
  whatsapp_phone_number_id?: string | null;
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
  slug?: string | null;
  short_description?: string | null;
  category?: string | null;
  discount_percent: number;
  sku?: string | null;
  image_path?: string | null;
  gallery_paths: string[];
  cta_label?: string | null;
  cta_url?: string | null;
  display_order: number;
  is_featured: boolean;
  is_active: boolean;
  deleted_at?: string | null;
}

export interface Service extends BaseEntity {
  company_id: string;
  name: string;
  description: string;
  deliverables: string[];
  /** Human-readable duration, e.g. "2-6 weeks". Predates the catalog columns
   * and is what the public card and voice tool already read, so it serves as
   * the module's Duration field rather than a second column. */
  timeline: string;
  price: number;
  optional_addons?: Array<{ name: string; price: number }> | null;
  currency: string;
  slug?: string | null;
  short_description?: string | null;
  category?: string | null;
  image_path?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  display_order: number;
  is_featured: boolean;
  is_active: boolean;
  deleted_at?: string | null;
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

/** HOT/WARM push the conversation toward booking; COLD routes to the nurture
 * path instead of being dropped (see LeadQualificationService.classify and
 * ToolRegistry's cold-lead nurture email). Distinct from `score_category`
 * (HIGH/MEDIUM/LOW) — score_category is the historical 0-100 point total,
 * temperature is the qualitative read that actually drives what the AI (and
 * a human reviewing the CRM) does next. */
export enum LeadTemperature {
  HOT = "HOT",
  WARM = "WARM",
  COLD = "COLD",
}

/** Why a lead landed COLD — set only when temperature is COLD, so a human
 * following up knows what to address rather than re-running the same
 * qualification conversation from scratch. */
export enum ColdReason {
  BUDGET = "BUDGET",
  TIMING = "TIMING",
  AUTHORITY = "AUTHORITY",
  NEED_UNCLEAR = "NEED_UNCLEAR",
  RESEARCH_PHASE = "RESEARCH_PHASE",
}

export enum NurtureStatus {
  NONE = "NONE",
  QUEUED = "QUEUED",
  SENT = "SENT",
  SKIPPED = "SKIPPED",
}

export type DecisionMakerStatus = "yes" | "no" | "shared";
export type Urgency = "immediate" | "this_quarter" | "exploring";
export type BuyingIntent = "high" | "medium" | "low";
export type Sentiment = "positive" | "neutral" | "negative";
export type NurtureChannel = "EMAIL" | "WHATSAPP" | "CONTENT";

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
  // Extended qualification signals — all optional because they're gathered
  // progressively through natural conversation, never all at once.
  current_solution?: string | null;
  decision_maker?: DecisionMakerStatus | null;
  urgency?: Urgency | null;
  buying_intent?: BuyingIntent | null;
  objections?: string | null;
  referral_source?: string | null;
  sentiment?: Sentiment | null;
  qualification_confidence?: number | null;
  conversation_summary?: string | null;
  qualification_notes?: string | null;
  lead_temperature?: LeadTemperature | null;
  cold_reason?: ColdReason | null;
  nurture_status?: NurtureStatus;
  nurture_channel_recommended?: NurtureChannel | null;
  next_followup_date?: string | null;
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
  /** The visitor-chosen language this call was conducted in (e.g. "ta",
   * "en", "hi") — null for calls that predate multilingual support. */
  language?: string | null;
  /** Which channel this conversation happened on — every conversation
   * before WhatsApp support defaults to "voice" at the database level. */
  channel?: "voice" | "whatsapp";
  /** The WhatsApp sender's stable wa_id — the channel's analogue of
   * vapi_call_id, looked up on every inbound message since one WhatsApp
   * conversation spans many messages/days rather than one call. */
  whatsapp_wa_id?: string | null;
  /** The authored question number this conversation is currently waiting
   * on an answer for. A live voice call's LLM holds this in its own
   * context; WhatsApp's stateless webhook has nothing else to hold it. */
  whatsapp_pending_question?: number | null;
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
  language_settings: Record<string, unknown>;
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

/** What `save_lead`/`update_lead_qualification` actually persist beyond the
 * base contact fields — every field optional since the AI records whatever
 * it has learned so far, not a completed form. Shared between both tools so
 * a lead saved early in the call and refined later goes through the exact
 * same validation and scoring path. */
export const LeadQualificationSignalsSchema = z.object({
  current_solution: z.string().max(500).optional(),
  decision_maker: z.enum(["yes", "no", "shared"]).optional(),
  urgency: z.enum(["immediate", "this_quarter", "exploring"]).optional(),
  buying_intent: z.enum(["high", "medium", "low"]).optional(),
  objections: z.string().max(1000).optional(),
  referral_source: z.string().max(200).optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  qualification_confidence: z.number().min(0).max(1).optional(),
  conversation_summary: z.string().max(2000).optional(),
  qualification_notes: z.string().max(2000).optional(),
});

export type LeadQualificationSignals = z.infer<typeof LeadQualificationSignalsSchema>;

export const CreateAppointmentSchema = z.object({
  company_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  calcom_booking_id: z.string().optional(),
  meeting_url: z.string().url().optional(),
  /** Defaults to BOOKED for the admin path, which always creates a real
   * Cal.com event first. The voice path passes REQUESTED when it could not
   * reach a calendar, so an unconfirmed intent is never stored as a booking. */
  status: z.nativeEnum(AppointmentStatus).optional(),
});

// Slug rule: URL-safe, lowercase, hyphen-separated. Enforced here rather than
// only normalised in the UI so an API caller can't create "My Product!" as a
// slug and break card URLs later. Exported because the Employee module's
// public-URL slug (a GLOBAL namespace, unlike the per-company product/service
// slugs below) reuses the identical rule rather than drifting a second regex.
export const SlugSchema = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers and hyphens");

export const CreateProductSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(2).max(255),
  description: z.string().min(5),
  features: z.array(z.string().min(1)).default([]),
  benefits: z.array(z.string().min(1)).default([]),
  pricing: z.number().nonnegative(),
  currency: z.string().min(3).max(10).default("USD"),
  target_audience: z.string().optional().nullable(),
  slug: SlugSchema.optional().nullable(),
  short_description: z.string().max(280).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  discount_percent: z.number().min(0).max(100).default(0),
  sku: z.string().max(64).optional().nullable(),
  image_path: z.string().optional().nullable(),
  gallery_paths: z.array(z.string()).default([]),
  cta_label: z.string().max(60).optional().nullable(),
  cta_url: z.string().url().optional().nullable(),
  display_order: z.number().int().min(0).default(0),
  is_featured: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

/** Everything editable except tenancy; company_id travels separately for the
 * authorization check and is never updatable. */
export const UpdateProductSchema = CreateProductSchema.omit({ company_id: true }).partial();

export const CreateServiceSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(2).max(255),
  description: z.string().min(5),
  // Deliverables is the services equivalent of a product's features list.
  deliverables: z.array(z.string().min(1)).default([]),
  /** Duration. Free text rather than a number + unit because real engagements
   * are quoted as ranges ("2-6 weeks", "one afternoon"), which a numeric field
   * cannot express without lying about precision. */
  timeline: z.string().max(100).default(""),
  price: z.number().nonnegative(),
  currency: z.string().min(3).max(10).default("USD"),
  slug: SlugSchema.optional().nullable(),
  short_description: z.string().max(280).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  image_path: z.string().optional().nullable(),
  cta_label: z.string().max(60).optional().nullable(),
  cta_url: z.string().url().optional().nullable(),
  display_order: z.number().int().min(0).default(0),
  is_featured: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const UpdateServiceSchema = CreateServiceSchema.omit({ company_id: true }).partial();

/** Voice identities the platform offers. Lives in the domain because it is
 * what an admin is allowed to pick, not a transport detail — `shared/lib/voice`
 * imports this list to validate what actually reaches Vapi, so the dropdown and
 * the runtime can never drift apart. */
export const SUPPORTED_VOICE_IDS = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "marin", "cedar"] as const;
export type SupportedVoiceId = (typeof SUPPORTED_VOICE_IDS)[number];

export const CreateEmployeeSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(2).max(255),
  designation: z.string().min(2).max(255),
  // Both appear on the public card and both are what a lead uses to reach a
  // human, so neither is optional — a card with no way to make contact is the
  // one failure mode this module exists to prevent.
  email: z.string().email(),
  phone: z.string().min(6).max(40),
  office_address: z.string().max(500).optional().nullable(),
  working_hours: z.string().max(120).optional().nullable(),
  /** Free-form label→URL. Values must be absolute URLs: the card renders these
   * as links, and a relative value would silently resolve against our own
   * origin instead of the intended profile. */
  social_links: z.record(z.string().url()).optional().nullable(),
  avatar_path: z.string().optional().nullable(),
  /** NULL means "inherit the company/agent default" rather than a stored copy
   * of it, so changing the default later still reaches these employees. */
  voice_id: z.enum(SUPPORTED_VOICE_IDS).optional().nullable(),
  prompt_override: z.string().max(4000).optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
  display_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  /** Short public URL slug (see Employee.slug) — capped well below the
   * product/service max since this one is meant to be memorable and printable,
   * not a long descriptive handle. */
  slug: SlugSchema.max(80).optional().nullable(),
});

/** Everything editable except tenancy; company_id travels separately for the
 * authorization check and is never updatable. `user_id` is deliberately absent
 * — linking an employee row to a login is the Members module's job, and
 * allowing it here would let an employee edit grant someone else's access. */
export const UpdateEmployeeSchema = CreateEmployeeSchema.omit({ company_id: true }).partial();

export const CreateFAQSchema = z.object({
  company_id: z.string().uuid(),
  category: z.string().min(2),
  question: z.string().min(5),
  answer: z.string().min(2),
});
