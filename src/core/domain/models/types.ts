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

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  COMPANY_ADMIN = "COMPANY_ADMIN",
  EMPLOYEE = "EMPLOYEE",
}

// ----------------------------------------------------
// Entity Interfaces
// ----------------------------------------------------

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
}

export interface PromptTemplate extends BaseEntity {
  company_id: string;
  module_name: "identity" | "behavior" | "sales" | "knowledge" | "security" | "booking" | "qualification" | "fallback";
  template_content: string;
  version: number;
  is_active: boolean;
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
