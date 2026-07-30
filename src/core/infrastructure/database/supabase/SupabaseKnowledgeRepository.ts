import { IKnowledgeRepository } from "@/core/domain/repositories/IKnowledgeRepository";
import { Company, Employee, Product, Service, FAQ } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

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

  async getProductsByCompany(companyId: string): Promise<Product[]> {
    const { data, error } = await supabaseAdmin.from("products").select().eq("company_id", companyId).is("deleted_at", null);
    if (error) throw new Error(`getProductsByCompany failed: ${error.message}`);
    return (data as Product[]) || [];
  }

  async getServicesByCompany(companyId: string): Promise<Service[]> {
    const { data, error } = await supabaseAdmin.from("services").select().eq("company_id", companyId).is("deleted_at", null);
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
    const { data, error } = await supabaseAdmin
      .from("products")
      .select()
      .eq("company_id", companyId)
      .textSearch("fts", query, { config: "english", type: "plain" })
      .is("deleted_at", null);

    if (error) throw new Error(`searchProducts failed: ${error.message}`);
    return (data as Product[]) || [];
  }
}
