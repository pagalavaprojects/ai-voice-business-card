import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseSettingsRepository } from "@/core/infrastructure/database/supabase/SupabaseSettingsRepository";

const settingsRepo = new SupabaseSettingsRepository();

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const UpdateBrandingSchema = z.object({
  company_id: z.string().uuid(),
  primary_color: z.string().regex(HEX_COLOR).optional(),
  secondary_color: z.string().regex(HEX_COLOR).optional(),
  font_family: z.string().min(1).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpdateBrandingSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "manage:branding");

    const branding = await settingsRepo.upsertBranding(parsed.company_id, {
      primary_color: parsed.primary_color,
      secondary_color: parsed.secondary_color,
      font_family: parsed.font_family,
    });

    return formatApiResponse(branding, 200, "Branding saved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
