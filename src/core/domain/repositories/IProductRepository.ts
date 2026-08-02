import { z } from "zod";
import { Product, CreateProductSchema, UpdateProductSchema } from "../models/types";

export interface ProductFilter {
  company_id: string;
  search?: string;
  category?: string;
  /** "active" | "inactive" — omitted means both. */
  status?: "active" | "inactive";
  featured?: boolean;
  sortBy?: "name" | "pricing" | "created_at" | "updated_at" | "display_order";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** Counts for the module's stat tiles, computed in the same request as the
 * list so the tiles and the table can never disagree about what exists. */
export interface ProductStats {
  total: number;
  active: number;
  inactive: number;
  featured: number;
  addedLast30Days: number;
}

export interface IProductRepository {
  listProducts(filter: ProductFilter): Promise<{ products: Product[]; total: number; stats: ProductStats }>;
  getProductById(id: string): Promise<Product | null>;
  createProduct(data: z.infer<typeof CreateProductSchema>): Promise<Product>;
  updateProduct(id: string, data: z.infer<typeof UpdateProductSchema>): Promise<Product>;
  softDeleteProduct(id: string): Promise<boolean>;
  /** Bulk actions are scoped by company_id in the WHERE clause, not only by
   * the ids — a request carrying another tenant's product ids must be a
   * no-op even if authorization were somehow bypassed. */
  bulkSetActive(companyId: string, ids: string[], active: boolean): Promise<number>;
  bulkSoftDelete(companyId: string, ids: string[]): Promise<number>;
}
