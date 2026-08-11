import { ICRMRepository, LeadFilter } from "@/core/domain/repositories/ICRMRepository";
import { Lead, CreateLeadSchema, LeadScoreCategory, LeadStatus, LeadActivity } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { isPlaceholderCredential } from "@/shared/lib/security";
import { Logger } from "@/shared/lib/logger";
import { z } from "zod";

const SUPABASE_UNCONFIGURED = isPlaceholderCredential(process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Columns added by the 20260812 lead-qualification-engine migration. Kept as
 * an explicit list (not derived from the Lead type) so updateLeadQualification
 * can strip exactly these — and only these — when the migration hasn't been
 * applied to the connected database yet. */
const QUALIFICATION_ENGINE_COLUMNS = new Set<string>([
  "current_solution",
  "decision_maker",
  "urgency",
  "buying_intent",
  "objections",
  "referral_source",
  "sentiment",
  "qualification_confidence",
  "conversation_summary",
  "qualification_notes",
  "lead_temperature",
  "cold_reason",
  "nurture_status",
  "nurture_channel_recommended",
  "next_followup_date",
]);

/** PostgREST rejects an entire `.update()` payload if ANY key doesn't match a
 * known column — it validates against its schema cache before ever reaching
 * Postgres, so this fails atomically rather than partially applying. It
 * reports this as `PGRST204` ("Could not find the '<col>' column ... in the
 * schema cache"); the raw Postgres `42703` (undefined_column) is matched too
 * in case a request reaches Postgres directly instead of through PostgREST's
 * cache check. */
function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  if (error.code === "PGRST204" || error.code === "42703") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes("schema cache") || message.includes("does not exist");
}

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
      if (SUPABASE_UNCONFIGURED) {
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
          owner_id: null,
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      throw new Error(`SupabaseCRMRepository.createLead failed: ${error.message}`);
    }

    await this.addActivity(lead.id, validated.company_id, "STATUS_CHANGE", "Lead created", undefined, { status: "NEW" });
    return lead as Lead;
  }

  async getLeadById(id: string): Promise<Lead | null> {
    const { data: lead, error } = await this.demoSafe(() =>
      supabaseAdmin.from("leads").select().eq("id", id).is("deleted_at", null).single()
    );
    if (error && error.code !== "PGRST116") {
      throw new Error(`SupabaseCRMRepository.getLeadById failed: ${error.message}`);
    }
    return (lead as Lead) || null;
  }

  /** Most recent lead linked to a given conversation — how the qualification
   * sequencing tool resolves a lead SERVER-SIDE (from the Vapi call's own
   * conversation row) instead of trusting the model to have already called
   * save_lead with a lead_id. No uniqueness constraint on
   * leads.conversation_id, so this takes the newest match rather than
   * .single() (which would throw on more than one row) — same pattern the
   * qualification-status route already uses for this exact lookup. */
  async getLeadByConversationId(conversationId: string): Promise<Lead | null> {
    const { data: lead, error } = await this.demoSafe(() =>
      supabaseAdmin
        .from("leads")
        .select()
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    if (error) {
      throw new Error(`SupabaseCRMRepository.getLeadByConversationId failed: ${error.message}`);
    }
    return (lead as Lead) || null;
  }

  async getLeadByEmail(companyId: string, email: string): Promise<Lead | null> {
    const { data: lead, error } = await this.demoSafe(() =>
      supabaseAdmin.from("leads").select().eq("company_id", companyId).eq("email", email).is("deleted_at", null).single()
    );
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

  /** The qualification engine's patch always includes core, pre-existing
   * columns (score, status, ...) alongside the 15 columns the 20260812
   * migration adds. If that migration hasn't reached this database yet,
   * PostgREST rejects the whole update — without this fallback, every
   * save_lead/update_lead_qualification call would throw, breaking lead
   * capture entirely rather than just degrading qualification. Retrying with
   * the qualification-only keys stripped keeps the core lead record (and the
   * visitor's contact details) saving correctly either way. */
  async updateLeadQualification(id: string, patch: Partial<Lead>): Promise<Lead> {
    const { data: lead, error } = await supabaseAdmin.from("leads").update(patch).eq("id", id).select().single();
    if (!error) return lead as Lead;

    if (!isMissingColumnError(error)) {
      throw new Error(`SupabaseCRMRepository.updateLeadQualification failed: ${error.message}`);
    }

    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => !QUALIFICATION_ENGINE_COLUMNS.has(key))
    );
    Logger.warn("Lead qualification columns missing (migration not applied yet) — saving core fields only", {
      leadId: id,
      droppedKeys: Object.keys(patch).filter((key) => QUALIFICATION_ENGINE_COLUMNS.has(key)),
    });
    const { data: fallbackLead, error: fallbackError } = await supabaseAdmin
      .from("leads")
      .update(safePatch)
      .eq("id", id)
      .select()
      .single();
    if (fallbackError) throw new Error(`SupabaseCRMRepository.updateLeadQualification failed: ${fallbackError.message}`);
    return fallbackLead as Lead;
  }

  async updateLeadStatus(id: string, status: Lead["status"], actorUserId?: string): Promise<Lead> {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`SupabaseCRMRepository.updateLeadStatus failed: ${error.message}`);
    const row = lead as Lead;
    await this.addActivity(id, row.company_id, "STATUS_CHANGE", `Status changed to ${status}`, actorUserId, { status });
    return row;
  }

  async updateLeadOwner(id: string, ownerId: string | null, actorUserId?: string): Promise<Lead> {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .update({ owner_id: ownerId })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`SupabaseCRMRepository.updateLeadOwner failed: ${error.message}`);
    const row = lead as Lead;
    await this.addActivity(id, row.company_id, "OWNER_CHANGE", "Owner changed", actorUserId, { owner_id: ownerId });
    return row;
  }

  async updateLeadTags(id: string, tags: string[]): Promise<Lead> {
    const { data: lead, error } = await supabaseAdmin.from("leads").update({ tags }).eq("id", id).select().single();
    if (error) throw new Error(`SupabaseCRMRepository.updateLeadTags failed: ${error.message}`);
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
    if (filter.search) {
      const term = filter.search.replace(/[%_]/g, "");
      query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,business_name.ilike.%${term}%`);
    }

    const sortColumn = filter.sortBy === "score" ? "score" : filter.sortBy === "name" ? "name" : "created_at";
    query = query.order(sortColumn, { ascending: filter.sortDir === "asc" });

    const limit = filter.limit || 20;
    const offset = filter.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      if (SUPABASE_UNCONFIGURED) return { leads: [], total: 0 };
      throw new Error(`SupabaseCRMRepository.listLeads failed: ${error.message}`);
    }

    return { leads: (data as Lead[]) || [], total: count || 0 };
  }

  async softDeleteLead(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(`SupabaseCRMRepository.softDeleteLead failed: ${error.message}`);
    return true;
  }

  async addActivity(
    leadId: string,
    companyId: string,
    type: LeadActivity["type"],
    content?: string,
    actorUserId?: string,
    metadata?: Record<string, unknown>
  ): Promise<LeadActivity> {
    const { data, error } = await supabaseAdmin
      .from("lead_activities")
      .insert({
        lead_id: leadId,
        company_id: companyId,
        type,
        content,
        actor_user_id: actorUserId,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      if (SUPABASE_UNCONFIGURED) {
        return {
          id: `activity_demo_${Date.now()}`,
          lead_id: leadId,
          company_id: companyId,
          type,
          content: content || null,
          actor_user_id: actorUserId || null,
          metadata: metadata || {},
          created_at: new Date().toISOString(),
        };
      }
      throw new Error(`SupabaseCRMRepository.addActivity failed: ${error.message}`);
    }
    return data as LeadActivity;
  }

  async getActivityTimeline(leadId: string): Promise<LeadActivity[]> {
    const { data, error } = await supabaseAdmin
      .from("lead_activities")
      .select()
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (error) {
      if (SUPABASE_UNCONFIGURED) return [];
      throw new Error(`SupabaseCRMRepository.getActivityTimeline failed: ${error.message}`);
    }
    return (data as LeadActivity[]) || [];
  }

  /** Read-only calls (getLeadById etc.) degrade to `null` instead of throwing
   * when Supabase isn't configured, matching createLead's existing demo
   * fallback instead of surfacing a raw "fetch failed" to API consumers. */
  private async demoSafe<T>(fn: () => PromiseLike<T>): Promise<T | { data: null; error: null }> {
    try {
      return await fn();
    } catch (err) {
      if (SUPABASE_UNCONFIGURED) return { data: null, error: null };
      throw err;
    }
  }
}
