import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseEmployeeRepository } from "@/core/infrastructure/database/supabase/SupabaseEmployeeRepository";
import { CreateEmployeeSchema } from "@/core/domain/models/types";
import { EmployeeFilter } from "@/core/domain/repositories/IEmployeeRepository";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";

const employeeRepo = new SupabaseEmployeeRepository();

/**
 * The paginated shape ({ employees, total, stats }) is opt-in via `?view=table`.
 *
 * Without it this route still returns a bare Employee[], because the Prompt
 * Builder's employee picker already consumes that shape — silently changing it
 * would have emptied that dropdown in production with no error raised anywhere,
 * the same class of failure as the catalog migration incident. The new module
 * asks for the richer shape explicitly.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const companyId = params.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:employees");

    const tableView = params.get("view") === "table";
    const status = params.get("status");

    const filter: EmployeeFilter = {
      company_id: companyId,
      search: params.get("search") ?? undefined,
      designation: params.get("designation") ?? undefined,
      status: status === "active" || status === "inactive" ? status : undefined,
      sortBy: (params.get("sortBy") as EmployeeFilter["sortBy"]) ?? undefined,
      sortDir: params.get("sortDir") === "desc" ? "desc" : "asc",
      // The legacy shape was unpaginated; keeping its callers on a full page
      // preserves that behaviour up to the 100-row cap the repository enforces.
      limit: tableView ? Math.min(Number(params.get("limit")) || 20, 100) : 100,
      offset: tableView ? Number(params.get("offset")) || 0 : 0,
    };

    const result = await employeeRepo.listEmployees(filter);

    return formatApiResponse(tableView ? result : result.employees, 200, "Employees retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = CreateEmployeeSchema.parse(await req.json());
    await requireCompanyAccess(req, parsed.company_id, "write:employees");
    return formatApiResponse(await employeeRepo.createEmployee(parsed), 201, "Employee created successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
