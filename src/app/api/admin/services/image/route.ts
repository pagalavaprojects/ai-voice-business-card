import { NextRequest } from "next/server";
import { handleApiError } from "@/shared/lib/apiHandler";
import { handleCatalogImageUpload } from "@/shared/lib/catalogImageUpload";

// Reads the session cookie, so it can never be rendered statically.
export const dynamic = "force-dynamic";

/** Thin wrapper over the shared catalog upload handler — the bucket and the
 * permission are what make this route service-specific. */
export async function POST(req: NextRequest) {
  try {
    return await handleCatalogImageUpload(req, "service-images", "write:services");
  } catch (error) {
    return handleApiError(error);
  }
}
