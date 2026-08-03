import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseServiceRepository } from "@/core/infrastructure/database/supabase/SupabaseServiceRepository";
import { CreateServiceSchema } from "@/core/domain/models/types";
import { ServiceFilter } from "@/core/domain/repositories/IServiceRepository";

// Reads the session cookie and/or query params, so it can never be rendered
// statically.
export const dynamic = "force-dynamic";

const serviceRepo = new SupabaseServiceRepository();

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const companyId = params.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:services");

    const status = params.get("status");
    const featured = params.get("featured");

    const filter: ServiceFilter = {
      company_id: companyId,
      search: params.get("search") ?? undefined,
      category: params.get("category") ?? undefined,
      status: status === "active" || status === "inactive" ? status : undefined,
      featured: featured === "true" ? true : featured === "false" ? false : undefined,
      sortBy: (params.get("sortBy") as ServiceFilter["sortBy"]) ?? undefined,
      sortDir: params.get("sortDir") === "asc" ? "asc" : "desc",
      limit: Math.min(Number(params.get("limit")) || 20, 100),
      offset: Number(params.get("offset")) || 0,
    };

    return formatApiResponse(await serviceRepo.listServices(filter), 200, "Services retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = CreateServiceSchema.parse(await req.json());
    await requireCompanyAccess(req, parsed.company_id, "write:services");
    return formatApiResponse(await serviceRepo.createService(parsed), 201, "Service created successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
