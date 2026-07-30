import { Lead, CreateLeadSchema } from "../models/types";
import { z } from "zod";

export interface LeadFilter {
  company_id: string;
  status?: string;
  min_score?: number;
  limit?: number;
  offset?: number;
}

export interface ICRMRepository {
  createLead(data: z.infer<typeof CreateLeadSchema>): Promise<Lead>;
  getLeadById(id: string): Promise<Lead | null>;
  getLeadByEmail(companyId: string, email: string): Promise<Lead | null>;
  updateLeadScore(id: string, score: number, category: Lead["score_category"], reasoning?: string): Promise<Lead>;
  updateLeadStatus(id: string, status: Lead["status"]): Promise<Lead>;
  listLeads(filter: LeadFilter): Promise<{ leads: Lead[]; total: number }>;
  softDeleteLead(id: string): Promise<boolean>;
}
