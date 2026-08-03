import { z } from "zod";
import { Employee, CreateEmployeeSchema, UpdateEmployeeSchema } from "../models/types";

export interface EmployeeFilter {
  company_id: string;
  search?: string;
  designation?: string;
  /** "active" | "inactive" — omitted means both. */
  status?: "active" | "inactive";
  sortBy?: "name" | "designation" | "created_at" | "updated_at" | "display_order";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** Counts for the module's stat tiles, computed in the same request as the
 * list so the tiles and the table can never disagree about what exists. */
export interface EmployeeStats {
  total: number;
  active: number;
  inactive: number;
  /** Employees whose card is wired to a voice agent. The rest render a
   * contact-only card, which is a real state worth surfacing rather than
   * leaving an admin to discover it by scanning their own QR code. */
  withAgent: number;
  addedLast30Days: number;
}

export interface IEmployeeRepository {
  listEmployees(filter: EmployeeFilter): Promise<{ employees: Employee[]; total: number; stats: EmployeeStats }>;
  getEmployeeById(id: string): Promise<Employee | null>;
  createEmployee(data: z.infer<typeof CreateEmployeeSchema>): Promise<Employee>;
  updateEmployee(id: string, data: z.infer<typeof UpdateEmployeeSchema>): Promise<Employee>;
  softDeleteEmployee(id: string): Promise<boolean>;
  /** Bulk actions scope by company_id in the WHERE clause, not only by the
   * ids — a request carrying another tenant's employee ids must be a no-op
   * even if authorization were somehow bypassed. */
  bulkSetActive(companyId: string, ids: string[], active: boolean): Promise<number>;
  bulkSoftDelete(companyId: string, ids: string[]): Promise<number>;
}
