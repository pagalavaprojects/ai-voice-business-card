import { z } from "zod";
import { Service, CreateServiceSchema, UpdateServiceSchema } from "../models/types";

export interface ServiceFilter {
  company_id: string;
  search?: string;
  category?: string;
  /** "active" | "inactive" — omitted means both. */
  status?: "active" | "inactive";
  featured?: boolean;
  sortBy?: "name" | "price" | "created_at" | "updated_at" | "display_order";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** Counts for the module's stat tiles, computed in the same request as the
 * list so the tiles and the table can never disagree about what exists. */
export interface ServiceStats {
  total: number;
  active: number;
  inactive: number;
  featured: number;
  addedLast30Days: number;
}

export interface IServiceRepository {
  listServices(filter: ServiceFilter): Promise<{ services: Service[]; total: number; stats: ServiceStats }>;
  getServiceById(id: string): Promise<Service | null>;
  createService(data: z.infer<typeof CreateServiceSchema>): Promise<Service>;
  updateService(id: string, data: z.infer<typeof UpdateServiceSchema>): Promise<Service>;
  softDeleteService(id: string): Promise<boolean>;
  /** Bulk actions scope by company_id in the WHERE clause, not only by the
   * ids — a request carrying another tenant's service ids must be a no-op
   * even if authorization were somehow bypassed. */
  bulkSetActive(companyId: string, ids: string[], active: boolean): Promise<number>;
  bulkSoftDelete(companyId: string, ids: string[]): Promise<number>;
}
