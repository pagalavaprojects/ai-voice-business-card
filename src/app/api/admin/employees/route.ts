import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { Employee } from "@/core/domain/models/types";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:employees");

    const { data, error } = await supabaseAdmin.from("employees").select().eq("company_id", companyId).is("deleted_at", null);
    if (error) throw new Error(`Failed to list employees: ${error.message}`);

    return formatApiResponse((data as Employee[]) || [], 200, "Employees retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
