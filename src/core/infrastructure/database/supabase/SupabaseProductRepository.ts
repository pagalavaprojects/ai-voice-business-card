import { z } from "zod";
import { IProductRepository, ProductFilter, ProductStats } from "@/core/domain/repositories/IProductRepository";
import { Product, CreateProductSchema, UpdateProductSchema } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

const SORTABLE: Record<NonNullable<ProductFilter["sortBy"]>, string> = {
  name: "name",
  pricing: "pricing",
  created_at: "created_at",
  updated_at: "updated_at",
  display_order: "display_order",
};

export class SupabaseProductRepository implements IProductRepository {
  async listProducts(filter: ProductFilter): Promise<{ products: Product[]; total: number; stats: ProductStats }> {
    let query = supabaseAdmin
      .from("products")
      .select("*", { count: "exact" })
      .eq("company_id", filter.company_id)
      .is("deleted_at", null);

    if (filter.search) {
      // Escape PostgREST pattern characters so a search for "50%" doesn't
      // become a wildcard match.
      const term = filter.search.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%,sku.ilike.%${term}%,category.ilike.%${term}%`);
    }
    if (filter.category) query = query.eq("category", filter.category);
    if (filter.status === "active") query = query.eq("is_active", true);
    if (filter.status === "inactive") query = query.eq("is_active", false);
    if (filter.featured !== undefined) query = query.eq("is_featured", filter.featured);

    const sortBy = SORTABLE[filter.sortBy ?? "updated_at"];
    query = query.order(sortBy, { ascending: filter.sortDir === "asc" });

    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const head = () =>
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("company_id", filter.company_id).is("deleted_at", null);

    const [page, totalAll, active, featured, recent] = await Promise.all([
      query,
      head(),
      head().eq("is_active", true),
      head().eq("is_featured", true),
      head().gte("created_at", monthAgo),
    ]);

    if (page.error) throw new Error(`listProducts failed: ${page.error.message}`);

    const stats: ProductStats = {
      total: totalAll.count ?? 0,
      active: active.count ?? 0,
      inactive: (totalAll.count ?? 0) - (active.count ?? 0),
      featured: featured.count ?? 0,
      addedLast30Days: recent.count ?? 0,
    };

    return { products: (page.data as Product[]) ?? [], total: page.count ?? 0, stats };
  }

  async getProductById(id: string): Promise<Product | null> {
    const { data, error } = await supabaseAdmin.from("products").select().eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`getProductById failed: ${error.message}`);
    return (data as Product) ?? null;
  }

  async createProduct(data: z.infer<typeof CreateProductSchema>): Promise<Product> {
    const { data: product, error } = await supabaseAdmin.from("products").insert(data).select().single();
    if (error) {
      // Surface the slug conflict as its own message: "duplicate key" alone
      // gives an admin nothing to act on.
      if (error.code === "23505" && error.message.includes("idx_products_company_slug")) {
        throw new Error("A product with this slug already exists. Choose a different slug.");
      }
      throw new Error(`createProduct failed: ${error.message}`);
    }
    return product as Product;
  }

  async updateProduct(id: string, data: z.infer<typeof UpdateProductSchema>): Promise<Product> {
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) {
      if (error.code === "23505" && error.message.includes("idx_products_company_slug")) {
        throw new Error("A product with this slug already exists. Choose a different slug.");
      }
      throw new Error(`updateProduct failed: ${error.message}`);
    }
    return product as Product;
  }

  async softDeleteProduct(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from("products")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id);
    if (error) throw new Error(`softDeleteProduct failed: ${error.message}`);
    return true;
  }

  async bulkSetActive(companyId: string, ids: string[], active: boolean): Promise<number> {
    if (ids.length === 0) return 0;
    const { data, error } = await supabaseAdmin
      .from("products")
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
      .from("products")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("company_id", companyId)
      .in("id", ids)
      .is("deleted_at", null)
      .select("id");
    if (error) throw new Error(`bulkSoftDelete failed: ${error.message}`);
    return data?.length ?? 0;
  }
}
