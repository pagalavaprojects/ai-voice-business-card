import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { supabaseAdmin } from "@/shared/lib/supabase";

export interface GlobalSearchResult {
  type: "lead" | "agent" | "knowledge" | "appointment" | "employee";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/** One search across the five entity types a company admin actually
 * looks things up by name for. Each query is scoped to company_id and
 * capped at 5 results — this is a lookup aid, not a paginated search
 * results page. */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const q = req.nextUrl.searchParams.get("q");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");
    if (!q || q.trim().length < 2) return formatApiResponse([], 200, "Query too short");

    await requireCompanyAccess(req, companyId, "read:leads");

    const term = q.trim().replace(/[%_]/g, "");
    const like = `%${term}%`;

    const [leads, agents, knowledge, appointments, employees] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id, name, email, business_name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .or(`name.ilike.${like},email.ilike.${like},business_name.ilike.${like}`)
        .limit(5),
      supabaseAdmin.from("ai_agents").select("id, name, department").eq("company_id", companyId).is("deleted_at", null).ilike("name", like).limit(5),
      supabaseAdmin.from("knowledge_documents").select("id, title, status").eq("company_id", companyId).is("deleted_at", null).ilike("title", like).limit(5),
      supabaseAdmin
        .from("appointments")
        .select("id, start_time, status, leads(name)")
        .eq("company_id", companyId)
        .filter("leads.name", "ilike", like)
        .limit(5),
      supabaseAdmin.from("employees").select("id, name, designation").eq("company_id", companyId).is("deleted_at", null).ilike("name", like).limit(5),
    ]);

    const results: GlobalSearchResult[] = [
      ...(leads.data || []).map((l) => ({
        type: "lead" as const,
        id: l.id,
        title: l.name,
        subtitle: l.business_name || l.email,
        href: `/dashboard/leads?leadId=${l.id}`,
      })),
      ...(agents.data || []).map((a) => ({
        type: "agent" as const,
        id: a.id,
        title: a.name,
        subtitle: a.department,
        href: `/dashboard/agents?agentId=${a.id}`,
      })),
      ...(knowledge.data || []).map((k) => ({
        type: "knowledge" as const,
        id: k.id,
        title: k.title,
        subtitle: k.status,
        href: `/dashboard/knowledge`,
      })),
      ...(appointments.data || []).map((a) => ({
        type: "appointment" as const,
        id: a.id,
        title: (a.leads as unknown as { name: string } | null)?.name || "Appointment",
        subtitle: new Date(a.start_time).toLocaleString(),
        href: `/dashboard/appointments`,
      })),
      ...(employees.data || []).map((e) => ({
        type: "employee" as const,
        id: e.id,
        title: e.name,
        subtitle: e.designation,
        href: `/dashboard/prompts`,
      })),
    ];

    return formatApiResponse(results, 200, `${results.length} result(s) found`);
  } catch (error) {
    return handleApiError(error);
  }
}
