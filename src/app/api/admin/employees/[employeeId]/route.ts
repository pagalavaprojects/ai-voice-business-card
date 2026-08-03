import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseEmployeeRepository } from "@/core/infrastructure/database/supabase/SupabaseEmployeeRepository";
import { UpdateEmployeeSchema } from "@/core/domain/models/types";
import { promptAssemblyService } from "@/core/infrastructure/bootstrap/assistantRuntime";
import { Logger } from "@/shared/lib/logger";

// Reads the session cookie and/or query params, so it can never be rendered
// statically.
export const dynamic = "force-dynamic";

const employeeRepo = new SupabaseEmployeeRepository();

/** Tenancy check shared by all three verbs: the employee must exist AND belong
 * to the company the caller is authorized for — a valid session for company A
 * must never read or mutate company B's employee by guessing their id. */
async function loadOwnedEmployee(
  req: NextRequest,
  employeeId: string,
  companyId: string | null,
  permission: "read:employees" | "write:employees" | "delete:employees"
) {
  if (!companyId) return { error: formatApiResponse(null, 400, "companyId is required") };
  await requireCompanyAccess(req, companyId, permission);
  const employee = await employeeRepo.getEmployeeById(employeeId);
  if (!employee || employee.company_id !== companyId) return { error: formatApiResponse(null, 404, "Employee not found") };
  return { employee };
}

/** The assembled system prompt embeds this employee's name, designation, hours
 * and contact details and is cached for five minutes. Without this, editing an
 * employee left the live voice assistant introducing them by their old name
 * until the TTL expired. Failure to invalidate must not fail the save — the
 * cache is an optimisation, the write already succeeded. */
async function refreshAssembledPrompt(companyId: string): Promise<void> {
  try {
    await promptAssemblyService.invalidateCompanyCache(companyId);
  } catch (err) {
    Logger.warn("Employee saved but prompt cache invalidation failed; the live prompt may lag by up to its TTL", {
      companyId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function GET(req: NextRequest, { params }: { params: { employeeId: string } }) {
  try {
    const result = await loadOwnedEmployee(req, params.employeeId, req.nextUrl.searchParams.get("companyId"), "read:employees");
    if ("error" in result) return result.error;
    return formatApiResponse(result.employee, 200, "Employee retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

const UpdateBodySchema = z.object({ company_id: z.string().uuid() }).and(UpdateEmployeeSchema);

export async function PUT(req: NextRequest, { params }: { params: { employeeId: string } }) {
  try {
    const parsed = UpdateBodySchema.parse(await req.json());
    const { company_id, ...fields } = parsed;

    const result = await loadOwnedEmployee(req, params.employeeId, company_id, "write:employees");
    if ("error" in result) return result.error;

    const employee = await employeeRepo.updateEmployee(params.employeeId, fields);
    await refreshAssembledPrompt(company_id);

    return formatApiResponse(employee, 200, "Employee updated successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { employeeId: string } }) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const result = await loadOwnedEmployee(req, params.employeeId, companyId, "delete:employees");
    if ("error" in result) return result.error;

    await employeeRepo.softDeleteEmployee(params.employeeId);
    await refreshAssembledPrompt(companyId as string);

    return formatApiResponse(null, 200, "Employee deleted");
  } catch (error) {
    return handleApiError(error);
  }
}
