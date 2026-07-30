import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";

const crmRepo = new SupabaseCRMRepository();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return formatApiResponse(null, 400, "companyId query parameter is required");
    }

    const status = searchParams.get("status") || undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 20;
    const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : 0;

    const result = await crmRepo.listLeads({
      company_id: companyId,
      status,
      limit,
      offset,
    });

    return formatApiResponse(result.leads, 200, "Leads retrieved successfully");
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to list leads";
    return formatApiResponse(null, 500, "Failed to list leads", [errorMessage]);
  }
}
