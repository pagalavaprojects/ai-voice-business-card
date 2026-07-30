import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseSettingsRepository } from "@/core/infrastructure/database/supabase/SupabaseSettingsRepository";

const settingsRepo = new SupabaseSettingsRepository();

const CreateApiKeySchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(2),
  scopes: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "manage:api_keys");

    const keys = await settingsRepo.listApiKeys(companyId);
    return formatApiResponse(keys, 200, "API keys retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateApiKeySchema.parse(body);

    const access = await requireCompanyAccess(req, parsed.company_id, "manage:api_keys");

    const { record, rawKey } = await settingsRepo.createApiKey(parsed.company_id, parsed.name, parsed.scopes, access.userId);

    return formatApiResponse(
      { ...record, rawKey },
      201,
      "API key created — copy it now, it will not be shown again"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
