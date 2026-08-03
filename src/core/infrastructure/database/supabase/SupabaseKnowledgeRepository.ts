import { IKnowledgeRepository } from "@/core/domain/repositories/IKnowledgeRepository";
import { Company, Employee, Product, Service, FAQ } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

/** Postgres "undefined_column". PostgREST surfaces it as code 42703. */
const UNDEFINED_COLUMN = "42703";

/**
 * True when a query failed only because the catalog columns from migrations
 * 20260805/20260806 are not applied yet.
 *
 * This guards the deploy-before-migrate window, which is not hypothetical: the
 * services release shipped ahead of its migration and blanked every product and
 * service on the live card. Worse, prompt assembly depends on those same reads,
 * so the assembled system prompt came back null and the voice assistant ran
 * with no knowledge of the company at all — a silent, total capability loss
 * from one missing column.
 */
function isMissingCatalogColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === UNDEFINED_COLUMN || /column .* does not exist/i.test(error.message ?? "");
}

export class SupabaseKnowledgeRepository implements IKnowledgeRepository {
  async getCompanyById(id: string): Promise<Company | null> {
    const { data, error } = await supabaseAdmin.from("companies").select().eq("id", id).single();
    if (error && error.code !== "PGRST116") throw new Error(`getCompanyById failed: ${error.message}`);
    return (data as Company) || null;
  }

  async getEmployeeById(id: string): Promise<Employee | null> {
    const { data, error } = await supabaseAdmin.from("employees").select().eq("id", id).single();
    if (error && error.code !== "PGRST116") throw new Error(`getEmployeeById failed: ${error.message}`);
    return (data as Employee) || null;
  }

  // This repository is the PUBLIC read path — the card, prompt assembly and
  // voice tools all come through here. It filters to active products so a
  // deactivated product disappears from every visitor-facing surface at once;
  // the admin module reads through SupabaseProductRepository, which sees
  // everything.
  async getProductsByCompany(companyId: string): Promise<Product[]> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select()
      .eq("company_id", companyId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (isMissingCatalogColumn(error)) {
      // Pre-migration: every row is still visible, which matches the
      // migration's own default of is_active = TRUE.
      const legacy = await supabaseAdmin
        .from("products")
        .select()
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (legacy.error) throw new Error(`getProductsByCompany failed: ${legacy.error.message}`);
      return (legacy.data as Product[]) || [];
    }

    if (error) throw new Error(`getProductsByCompany failed: ${error.message}`);
    return (data as Product[]) || [];
  }

  // Active-only, matching getProductsByCompany: this is the public read path,
  // so deactivating a service removes it from the card, the assembled prompt
  // and the search_services voice tool at once.
  async getServicesByCompany(companyId: string): Promise<Service[]> {
    const { data, error } = await supabaseAdmin
      .from("services")
      .select()
      .eq("company_id", companyId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (isMissingCatalogColumn(error)) {
      const legacy = await supabaseAdmin
        .from("services")
        .select()
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (legacy.error) throw new Error(`getServicesByCompany failed: ${legacy.error.message}`);
      return (legacy.data as Service[]) || [];
    }

    if (error) throw new Error(`getServicesByCompany failed: ${error.message}`);
    return (data as Service[]) || [];
  }

  async getFAQsByCompany(companyId: string): Promise<FAQ[]> {
    const { data, error } = await supabaseAdmin.from("faqs").select().eq("company_id", companyId).is("deleted_at", null);
    if (error) throw new Error(`getFAQsByCompany failed: ${error.message}`);
    return (data as FAQ[]) || [];
  }

  async searchFAQs(companyId: string, query: string): Promise<FAQ[]> {
    const { data, error } = await supabaseAdmin
      .from("faqs")
      .select()
      .eq("company_id", companyId)
      .textSearch("fts", query, { config: "english", type: "plain" })
      .is("deleted_at", null);

    if (error) throw new Error(`searchFAQs failed: ${error.message}`);
    return (data as FAQ[]) || [];
  }

  async searchProducts(companyId: string, query: string): Promise<Product[]> {
    // Same active-only rule as getProductsByCompany: the voice assistant must
    // not recommend a product the admin has taken off sale.
    const { data, error } = await supabaseAdmin
      .from("products")
      .select()
      .eq("company_id", companyId)
      .eq("is_active", true)
      .textSearch("fts", query, { config: "english", type: "plain" })
      .is("deleted_at", null);

    if (isMissingCatalogColumn(error)) {
      const legacy = await supabaseAdmin
        .from("products")
        .select()
        .eq("company_id", companyId)
        .textSearch("fts", query, { config: "english", type: "plain" })
        .is("deleted_at", null);
      if (legacy.error) throw new Error(`searchProducts failed: ${legacy.error.message}`);
      return (legacy.data as Product[]) || [];
    }

    if (error) throw new Error(`searchProducts failed: ${error.message}`);
    return (data as Product[]) || [];
  }
}
