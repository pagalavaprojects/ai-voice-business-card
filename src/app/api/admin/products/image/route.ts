import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";

// Reads the session cookie, so it can never be rendered statically.
export const dynamic = "force-dynamic";

const storage = new SupabaseStorageAdapter();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
// SVG deliberately excluded (unlike the logo route, where the admin uploads
// their own logo): product images render on the PUBLIC card, and SVG can
// carry scripts — an XSS vector served to every visitor.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const companyId = formData.get("companyId");
    const file = formData.get("file");

    if (typeof companyId !== "string") return formatApiResponse(null, 400, "companyId is required");
    if (!(file instanceof File)) return formatApiResponse(null, 400, "file is required");
    if (!ALLOWED_TYPES.includes(file.type)) return formatApiResponse(null, 400, "Image must be PNG, JPEG, or WebP");
    if (file.size > MAX_IMAGE_BYTES) return formatApiResponse(null, 413, "Image exceeds the 5MB upload limit");

    await requireCompanyAccess(req, companyId, "write:products");

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.type.split("/")[1];
    // Timestamped path: product images are content-addressed-ish rather than
    // overwritten in place, so an old card cached by a browser never shows a
    // half-replaced image.
    const storagePath = `${companyId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;

    await storage.ensureBucket("product-images", true);
    await storage.upload("product-images", storagePath, buffer, file.type);

    return formatApiResponse(
      { path: storagePath, url: storage.getPublicUrl("product-images", storagePath) },
      201,
      "Image uploaded"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
