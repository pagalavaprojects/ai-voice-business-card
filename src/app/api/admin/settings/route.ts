import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseSettingsRepository } from "@/core/infrastructure/database/supabase/SupabaseSettingsRepository";
import { supabaseAdmin } from "@/shared/lib/supabase";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const settingsRepo = new SupabaseSettingsRepository();

const UpdateSettingsSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(2).optional(),
  website: z.string().url().optional(),
  business_info: z.record(z.unknown()).optional(),
  calendar_settings: z.record(z.unknown()).optional(),
  email_settings: z.record(z.unknown()).optional(),
  voice_settings: z.record(z.unknown()).optional(),
  language_settings: z.record(z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:settings");

    const [company, branding, settings] = await Promise.all([
      supabaseAdmin.from("companies").select().eq("id", companyId).single(),
      settingsRepo.getBranding(companyId),
      settingsRepo.getSettings(companyId),
    ]);

    if (company.error) throw new Error(`Failed to load company: ${company.error.message}`);

    return formatApiResponse({ company: company.data, branding, settings }, 200, "Settings retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpdateSettingsSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "manage:settings");

    if (parsed.name || parsed.website) {
      const { error } = await supabaseAdmin
        .from("companies")
        .update({ ...(parsed.name && { name: parsed.name }), ...(parsed.website && { website: parsed.website }) })
        .eq("id", parsed.company_id);
      if (error) throw new Error(`Failed to update company profile: ${error.message}`);
    }

    const settings = await settingsRepo.upsertSettings(parsed.company_id, {
      business_info: parsed.business_info,
      calendar_settings: parsed.calendar_settings,
      email_settings: parsed.email_settings,
      voice_settings: parsed.voice_settings,
      language_settings: parsed.language_settings,
    });

    return formatApiResponse(settings, 200, "Settings saved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
