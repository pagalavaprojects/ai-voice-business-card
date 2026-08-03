import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseServiceRepository } from "@/core/infrastructure/database/supabase/SupabaseServiceRepository";
import { UpdateServiceSchema } from "@/core/domain/models/types";

// Reads the session cookie and/or query params, so it can never be rendered
// statically.
export const dynamic = "force-dynamic";

const serviceRepo = new SupabaseServiceRepository();

/** Tenancy check shared by all three verbs: the service must exist AND belong
 * to the company the caller is authorized for — a valid session for company A
 * must never read or mutate company B's service by guessing its id. */
async function loadOwnedService(
  req: NextRequest,
  serviceId: string,
  companyId: string | null,
  permission: "read:services" | "write:services" | "delete:services"
) {
  if (!companyId) return { error: formatApiResponse(null, 400, "companyId is required") };
  await requireCompanyAccess(req, companyId, permission);
  const service = await serviceRepo.getServiceById(serviceId);
  if (!service || service.company_id !== companyId) return { error: formatApiResponse(null, 404, "Service not found") };
  return { service };
}

export async function GET(req: NextRequest, { params }: { params: { serviceId: string } }) {
  try {
    const result = await loadOwnedService(req, params.serviceId, req.nextUrl.searchParams.get("companyId"), "read:services");
    if ("error" in result) return result.error;
    return formatApiResponse(result.service, 200, "Service retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

const UpdateBodySchema = z.object({ company_id: z.string().uuid() }).and(UpdateServiceSchema);

export async function PUT(req: NextRequest, { params }: { params: { serviceId: string } }) {
  try {
    const parsed = UpdateBodySchema.parse(await req.json());
    const { company_id, ...fields } = parsed;

    const result = await loadOwnedService(req, params.serviceId, company_id, "write:services");
    if ("error" in result) return result.error;

    return formatApiResponse(await serviceRepo.updateService(params.serviceId, fields), 200, "Service updated successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { serviceId: string } }) {
  try {
    const result = await loadOwnedService(req, params.serviceId, req.nextUrl.searchParams.get("companyId"), "delete:services");
    if ("error" in result) return result.error;

    await serviceRepo.softDeleteService(params.serviceId);
    return formatApiResponse(null, 200, "Service deleted");
  } catch (error) {
    return handleApiError(error);
  }
}
