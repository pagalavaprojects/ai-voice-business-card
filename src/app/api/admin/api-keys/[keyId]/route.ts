import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseSettingsRepository } from "@/core/infrastructure/database/supabase/SupabaseSettingsRepository";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const settingsRepo = new SupabaseSettingsRepository();

export async function DELETE(req: NextRequest, { params }: { params: { keyId: string } }) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "manage:api_keys");

    await settingsRepo.revokeApiKey(companyId, params.keyId);
    return formatApiResponse(null, 200, "API key revoked successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
