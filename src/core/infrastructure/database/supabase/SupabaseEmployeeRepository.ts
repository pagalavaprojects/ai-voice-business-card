import { z } from "zod";
import { IEmployeeRepository, EmployeeFilter, EmployeeStats } from "@/core/domain/repositories/IEmployeeRepository";
import { Employee, CreateEmployeeSchema, UpdateEmployeeSchema } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

const SORTABLE: Record<NonNullable<EmployeeFilter["sortBy"]>, string> = {
  name: "name",
  designation: "designation",
  created_at: "created_at",
  updated_at: "updated_at",
  display_order: "display_order",
};

/**
 * Admin-side reads for the Employee module — sees deactivated rows, which the
 * public card path (SupabaseKnowledgeRepository.getEmployeeById) does not act
 * on the same way.
 *
 * Deliberately mirrors SupabaseServiceRepository rather than inventing a second
 * shape: the filter/stat/bulk mechanics are identical across the three admin
 * modules, so a bug fixed in one is recognisable in the others.
 */
export class SupabaseEmployeeRepository implements IEmployeeRepository {
  async listEmployees(filter: EmployeeFilter): Promise<{ employees: Employee[]; total: number; stats: EmployeeStats }> {
    let query = supabaseAdmin
      .from("employees")
      .select("*", { count: "exact" })
      .eq("company_id", filter.company_id)
      .is("deleted_at", null);

    if (filter.search) {
      // Escape PostgREST pattern characters so searching for "50%" doesn't
      // become a wildcard match.
      const term = filter.search.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(`name.ilike.%${term}%,designation.ilike.%${term}%,email.ilike.%${term}%`);
    }
    if (filter.designation) query = query.eq("designation", filter.designation);
    if (filter.status === "active") query = query.eq("is_active", true);
    if (filter.status === "inactive") query = query.eq("is_active", false);

    query = query.order(SORTABLE[filter.sortBy ?? "display_order"], { ascending: filter.sortDir !== "desc" });

    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const head = () =>
      supabaseAdmin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("company_id", filter.company_id)
        .is("deleted_at", null);

    const [page, totalAll, active, recent, agents] = await Promise.all([
      query,
      head(),
      head().eq("is_active", true),
      head().gte("created_at", monthAgo),
      // Which employees have a voice agent is a join across tables, so it is
      // read from ai_agents rather than guessed from a flag on the employee
      // row that nothing keeps in sync.
      supabaseAdmin
        .from("ai_agents")
        .select("employee_id")
        .eq("company_id", filter.company_id)
        .is("deleted_at", null)
        .not("employee_id", "is", null),
    ]);

    if (page.error) throw new Error(`listEmployees failed: ${page.error.message}`);

    const agentEmployeeIds = [
      ...new Set(
        ((agents.data as Array<{ employee_id: string | null }> | null) ?? []).map((a) => a.employee_id).filter(Boolean) as string[]
      ),
    ];

    // An agent can outlive the employee it pointed at (the FK is ON DELETE SET
    // NULL, and our deletes are soft), so the id set is intersected with the
    // live roster instead of being counted directly — otherwise the tile would
    // claim coverage for people who are no longer listed.
    const withAgent =
      agentEmployeeIds.length === 0 ? { count: 0 } : await head().in("id", agentEmployeeIds);

    const stats: EmployeeStats = {
      total: totalAll.count ?? 0,
      active: active.count ?? 0,
      inactive: (totalAll.count ?? 0) - (active.count ?? 0),
      withAgent: withAgent.count ?? 0,
      addedLast30Days: recent.count ?? 0,
    };

    return { employees: (page.data as Employee[]) ?? [], total: page.count ?? 0, stats };
  }

  async getEmployeeById(id: string): Promise<Employee | null> {
    const { data, error } = await supabaseAdmin.from("employees").select().eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`getEmployeeById failed: ${error.message}`);
    return (data as Employee) ?? null;
  }

  async createEmployee(data: z.infer<typeof CreateEmployeeSchema>): Promise<Employee> {
    const { data: employee, error } = await supabaseAdmin.from("employees").insert(data).select().single();
    if (error) throw new Error(`createEmployee failed: ${error.message}`);
    return employee as Employee;
  }

  async updateEmployee(id: string, data: z.infer<typeof UpdateEmployeeSchema>): Promise<Employee> {
    const { data: employee, error } = await supabaseAdmin
      .from("employees")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw new Error(`updateEmployee failed: ${error.message}`);
    return employee as Employee;
  }

  /** Soft delete, and deactivate in the same statement. The row stays for the
   * conversations, leads and appointments that reference it — hard-deleting
   * would orphan a company's entire call history — but its card must stop
   * answering immediately, which is what is_active controls on the public
   * path. */
  async softDeleteEmployee(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from("employees")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id);
    if (error) throw new Error(`softDeleteEmployee failed: ${error.message}`);
    return true;
  }

  async bulkSetActive(companyId: string, ids: string[], active: boolean): Promise<number> {
    if (ids.length === 0) return 0;
    const { data, error } = await supabaseAdmin
      .from("employees")
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .in("id", ids)
      .is("deleted_at", null)
      .select("id");
    if (error) throw new Error(`bulkSetActive failed: ${error.message}`);
    return data?.length ?? 0;
  }

  async bulkSoftDelete(companyId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { data, error } = await supabaseAdmin
      .from("employees")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("company_id", companyId)
      .in("id", ids)
      .is("deleted_at", null)
      .select("id");
    if (error) throw new Error(`bulkSoftDelete failed: ${error.message}`);
    return data?.length ?? 0;
  }
}
