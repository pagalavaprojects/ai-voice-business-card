import { NextRequest } from "next/server";
import { handleApiError } from "@/shared/lib/apiHandler";
import { handleCatalogImageUpload } from "@/shared/lib/catalogImageUpload";

// Reads the session cookie, so it can never be rendered statically.
export const dynamic = "force-dynamic";

/** Thin wrapper over the shared catalog upload handler — the bucket and the
 * permission are what make this route employee-specific. Avatars land on the
 * public card, so they inherit the same rules the catalog images use: PNG/JPEG/
 * WebP only (no SVG, which can carry scripts), 5MB cap, timestamped paths. */
export async function POST(req: NextRequest) {
  try {
    return await handleCatalogImageUpload(req, "employee-avatars", "write:employees");
  } catch (error) {
    return handleApiError(error);
  }
}
