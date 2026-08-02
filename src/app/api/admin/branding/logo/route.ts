import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseSettingsRepository } from "@/core/infrastructure/database/supabase/SupabaseSettingsRepository";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const settingsRepo = new SupabaseSettingsRepository();
const storage = new SupabaseStorageAdapter();

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const companyId = formData.get("companyId");
    const file = formData.get("file");

    if (typeof companyId !== "string") return formatApiResponse(null, 400, "companyId is required");
    if (!(file instanceof File)) return formatApiResponse(null, 400, "file is required");
    if (!ALLOWED_TYPES.includes(file.type)) return formatApiResponse(null, 400, "Logo must be PNG, JPEG, SVG, or WebP");
    if (file.size > MAX_LOGO_BYTES) return formatApiResponse(null, 413, "Logo exceeds the 2MB upload limit");

    await requireCompanyAccess(req, companyId, "manage:branding");

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.type.split("/")[1].replace("svg+xml", "svg");
    const storagePath = `${companyId}/logo.${extension}`;

    await storage.ensureBucket("company-logos", true);
    await storage.upload("company-logos", storagePath, buffer, file.type);

    const branding = await settingsRepo.upsertBranding(companyId, { logo_storage_path: storagePath });
    const logoUrl = storage.getPublicUrl("company-logos", storagePath);

    return formatApiResponse({ branding, logoUrl }, 200, "Logo uploaded successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
