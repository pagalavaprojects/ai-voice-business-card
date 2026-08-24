import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess, requireCompanyDataScope } from "@/shared/lib/tenant";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";
import { CreateLeadSchema } from "@/core/domain/models/types";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const crmRepo = new SupabaseCRMRepository();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return formatApiResponse(null, 400, "companyId query parameter is required");
    }

    // Staff see only their own leads; OWNER/ADMIN see the company's.
    const { employeeId } = await requireCompanyDataScope(req, companyId, "read:leads");

    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const sortBy = (searchParams.get("sortBy") as "created_at" | "score" | "name") || "created_at";
    const sortDir = (searchParams.get("sortDir") as "asc" | "desc") || "desc";
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
    const offset = Number(searchParams.get("offset")) || 0;

    const result = await crmRepo.listLeads({
      company_id: companyId,
      ...(employeeId ? { employee_id: employeeId } : {}),
      status,
      search,
      sortBy,
      sortDir,
      limit,
      offset,
    });

    return formatApiResponse(
      { leads: result.leads, total: result.total, limit, offset },
      200,
      "Leads retrieved successfully"
    );
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateLeadSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:leads");

    const lead = await crmRepo.createLead(parsed);
    return formatApiResponse(lead, 201, "Lead created successfully");
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
