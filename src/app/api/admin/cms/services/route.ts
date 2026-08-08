// src/app/api/admin/cms/services/route.ts
import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { cmsRepository } from "@/core/infrastructure/database/supabase/SupabaseCMSRepository";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) {
      return formatApiResponse(null, 400, "companyId query parameter is required");
    }
    await requireCompanyAccess(req, companyId, "read:cms");

    const services = await cmsRepository.getServices(companyId);
    return formatApiResponse(services, 200, "Services retrieved successfully");
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const companyId = body.company_id;
    if (!companyId) {
      return formatApiResponse(null, 400, "company_id is required");
    }
    await requireCompanyAccess(req, companyId, "write:cms");

    const updated = await cmsRepository.upsertService({ ...body, company_id: companyId });
    return formatApiResponse(updated, 200, "Service saved successfully");
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
