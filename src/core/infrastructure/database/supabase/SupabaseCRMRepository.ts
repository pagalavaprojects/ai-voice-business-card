import { ICRMRepository, LeadFilter } from "@/core/domain/repositories/ICRMRepository";
import { Lead, CreateLeadSchema, LeadScoreCategory, LeadStatus } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { z } from "zod";

export class SupabaseCRMRepository implements ICRMRepository {
  async createLead(data: z.infer<typeof CreateLeadSchema>): Promise<Lead> {
    const validated = CreateLeadSchema.parse(data);
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .insert({
        company_id: validated.company_id,
        employee_id: validated.employee_id,
        conversation_id: validated.conversation_id,
        name: validated.name,
        email: validated.email,
        phone: validated.phone,
        business_name: validated.business_name,
        industry: validated.industry,
        problem_statement: validated.problem_statement,
        budget: validated.budget,
        timeline: validated.timeline,
        score: 0,
        score_category: LeadScoreCategory.LOW,
        status: LeadStatus.NEW,
      })
      .select()
      .single();

    if (error) {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("placeholder") || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return {
          id: `lead_demo_${Date.now()}`,
          company_id: validated.company_id,
          employee_id: validated.employee_id,
          conversation_id: validated.conversation_id || null,
          name: validated.name,
          email: validated.email,
          phone: validated.phone,
          business_name: validated.business_name || null,
          industry: validated.industry || null,
          problem_statement: validated.problem_statement || null,
          budget: validated.budget || null,
          timeline: validated.timeline || null,
          score: 0,
          score_category: LeadScoreCategory.LOW,
          status: LeadStatus.NEW,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      throw new Error(`SupabaseCRMRepository.createLead failed: ${error.message}`);
    }
    return lead as Lead;
  }

  async getLeadById(id: string): Promise<Lead | null> {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .select()
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`SupabaseCRMRepository.getLeadById failed: ${error.message}`);
    }
    return (lead as Lead) || null;
  }

  async getLeadByEmail(companyId: string, email: string): Promise<Lead | null> {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .select()
      .eq("company_id", companyId)
      .eq("email", email)
      .is("deleted_at", null)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`SupabaseCRMRepository.getLeadByEmail failed: ${error.message}`);
    }
    return (lead as Lead) || null;
  }

  async updateLeadScore(
    id: string,
    score: number,
    category: Lead["score_category"],
    reasoning?: string
  ): Promise<Lead> {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .update({
        score,
        score_category: category,
        score_reasoning: reasoning,
        status: category === "HIGH" ? "QUALIFIED" : "NEW",
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`SupabaseCRMRepository.updateLeadScore failed: ${error.message}`);
    return lead as Lead;
  }

  async updateLeadStatus(id: string, status: Lead["status"]): Promise<Lead> {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`SupabaseCRMRepository.updateLeadStatus failed: ${error.message}`);
    return lead as Lead;
  }

  async listLeads(filter: LeadFilter): Promise<{ leads: Lead[]; total: number }> {
    let query = supabaseAdmin
      .from("leads")
      .select("*", { count: "exact" })
      .eq("company_id", filter.company_id)
      .is("deleted_at", null);

    if (filter.status) query = query.eq("status", filter.status);
    if (filter.min_score !== undefined) query = query.gte("score", filter.min_score);

    const limit = filter.limit || 20;
    const offset = filter.offset || 0;
    query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false });

    const { data, count, error } = await query;
    if (error) throw new Error(`SupabaseCRMRepository.listLeads failed: ${error.message}`);

    return { leads: (data as Lead[]) || [], total: count || 0 };
  }

  async softDeleteLead(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(`SupabaseCRMRepository.softDeleteLead failed: ${error.message}`);
    return true;
  }
}
