import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseStorageAdapter, StorageBucket } from "@/core/infrastructure/storage/SupabaseStorageAdapter";
import { Permission } from "@/shared/lib/rbac";

const storage = new SupabaseStorageAdapter();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
// SVG deliberately excluded (unlike the logo route, where an admin uploads
// their own logo): catalog images render on the PUBLIC card, and SVG can
// carry scripts — an XSS vector served to every visitor rather than to the
// admin who uploaded it.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Shared implementation behind /api/admin/products/image and
 * /api/admin/services/image.
 *
 * The two routes stay separate so each writes to its own bucket and checks its
 * own permission — but the validation, sizing and path rules are identical and
 * live here, so a fix to one applies to both.
 */
export async function handleCatalogImageUpload(
  req: NextRequest,
  bucket: StorageBucket,
  permission: Permission
) {
  const formData = await req.formData();
  const companyId = formData.get("companyId");
  const file = formData.get("file");

  if (typeof companyId !== "string") return formatApiResponse(null, 400, "companyId is required");
  if (!(file instanceof File)) return formatApiResponse(null, 400, "file is required");
  if (!ALLOWED_TYPES.includes(file.type)) return formatApiResponse(null, 400, "Image must be PNG, JPEG, or WebP");
  if (file.size > MAX_IMAGE_BYTES) return formatApiResponse(null, 413, "Image exceeds the 5MB upload limit");

  await requireCompanyAccess(req, companyId, permission);

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.type.split("/")[1];
  // Timestamped path rather than overwriting in place, so a card already
  // cached by a browser never shows a half-replaced image.
  const storagePath = `${companyId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;

  await storage.ensureBucket(bucket, true);
  await storage.upload(bucket, storagePath, buffer, file.type);

  return formatApiResponse({ path: storagePath, url: storage.getPublicUrl(bucket, storagePath) }, 201, "Image uploaded");
}
