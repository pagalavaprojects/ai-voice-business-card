import { Lead, CreateLeadSchema, LeadActivity } from "../models/types";
import { z } from "zod";

export interface LeadFilter {
  company_id: string;
  status?: string;
  min_score?: number;
  search?: string;
  sortBy?: "created_at" | "score" | "name";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface ICRMRepository {
  createLead(data: z.infer<typeof CreateLeadSchema>): Promise<Lead>;
  getLeadById(id: string): Promise<Lead | null>;
  getLeadByEmail(companyId: string, email: string): Promise<Lead | null>;
  updateLeadScore(id: string, score: number, category: Lead["score_category"], reasoning?: string): Promise<Lead>;
  updateLeadStatus(id: string, status: Lead["status"], actorUserId?: string): Promise<Lead>;
  updateLeadOwner(id: string, ownerId: string | null, actorUserId?: string): Promise<Lead>;
  updateLeadTags(id: string, tags: string[]): Promise<Lead>;
  listLeads(filter: LeadFilter): Promise<{ leads: Lead[]; total: number }>;
  softDeleteLead(id: string): Promise<boolean>;
  addActivity(leadId: string, companyId: string, type: LeadActivity["type"], content?: string, actorUserId?: string, metadata?: Record<string, unknown>): Promise<LeadActivity>;
  getActivityTimeline(leadId: string): Promise<LeadActivity[]>;
}
