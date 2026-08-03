import { z } from "zod";
import { IServiceRepository, ServiceFilter, ServiceStats } from "@/core/domain/repositories/IServiceRepository";
import { Service, CreateServiceSchema, UpdateServiceSchema } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

const SORTABLE: Record<NonNullable<ServiceFilter["sortBy"]>, string> = {
  name: "name",
  price: "price",
  created_at: "created_at",
  updated_at: "updated_at",
  display_order: "display_order",
};

/**
 * Admin-side reads for the Services module — sees inactive and unpublished
 * rows. The PUBLIC path (card, prompt assembly, voice tool) goes through
 * SupabaseKnowledgeRepository, which filters to active only.
 */
export class SupabaseServiceRepository implements IServiceRepository {
  async listServices(filter: ServiceFilter): Promise<{ services: Service[]; total: number; stats: ServiceStats }> {
    let query = supabaseAdmin
      .from("services")
      .select("*", { count: "exact" })
      .eq("company_id", filter.company_id)
      .is("deleted_at", null);

    if (filter.search) {
      // Escape PostgREST pattern characters so searching for "50%" doesn't
      // become a wildcard match.
      const term = filter.search.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`);
    }
    if (filter.category) query = query.eq("category", filter.category);
    if (filter.status === "active") query = query.eq("is_active", true);
    if (filter.status === "inactive") query = query.eq("is_active", false);
    if (filter.featured !== undefined) query = query.eq("is_featured", filter.featured);

    query = query.order(SORTABLE[filter.sortBy ?? "updated_at"], { ascending: filter.sortDir === "asc" });

    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const head = () =>
      supabaseAdmin.from("services").select("id", { count: "exact", head: true }).eq("company_id", filter.company_id).is("deleted_at", null);

    const [page, totalAll, active, featured, recent] = await Promise.all([
      query,
      head(),
      head().eq("is_active", true),
      head().eq("is_featured", true),
      head().gte("created_at", monthAgo),
    ]);

    if (page.error) throw new Error(`listServices failed: ${page.error.message}`);

    const stats: ServiceStats = {
      total: totalAll.count ?? 0,
      active: active.count ?? 0,
      inactive: (totalAll.count ?? 0) - (active.count ?? 0),
      featured: featured.count ?? 0,
      addedLast30Days: recent.count ?? 0,
    };

    return { services: (page.data as Service[]) ?? [], total: page.count ?? 0, stats };
  }

  async getServiceById(id: string): Promise<Service | null> {
    const { data, error } = await supabaseAdmin.from("services").select().eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`getServiceById failed: ${error.message}`);
    return (data as Service) ?? null;
  }

  async createService(data: z.infer<typeof CreateServiceSchema>): Promise<Service> {
    const { data: service, error } = await supabaseAdmin.from("services").insert(data).select().single();
    if (error) {
      // Surface the slug conflict specifically: "duplicate key" alone gives an
      // admin nothing to act on.
      if (error.code === "23505" && error.message.includes("idx_services_company_slug")) {
        throw new Error("A service with this slug already exists. Choose a different slug.");
      }
      throw new Error(`createService failed: ${error.message}`);
    }
    return service as Service;
  }

  async updateService(id: string, data: z.infer<typeof UpdateServiceSchema>): Promise<Service> {
    const { data: service, error } = await supabaseAdmin
      .from("services")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) {
      if (error.code === "23505" && error.message.includes("idx_services_company_slug")) {
        throw new Error("A service with this slug already exists. Choose a different slug.");
      }
      throw new Error(`updateService failed: ${error.message}`);
    }
    return service as Service;
  }

  async softDeleteService(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from("services")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id);
    if (error) throw new Error(`softDeleteService failed: ${error.message}`);
    return true;
  }

  async bulkSetActive(companyId: string, ids: string[], active: boolean): Promise<number> {
    if (ids.length === 0) return 0;
    const { data, error } = await supabaseAdmin
      .from("services")
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
      .from("services")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("company_id", companyId)
      .in("id", ids)
      .is("deleted_at", null)
      .select("id");
    if (error) throw new Error(`bulkSoftDelete failed: ${error.message}`);
    return data?.length ?? 0;
  }
}
