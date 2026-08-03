import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseServiceRepository } from "@/core/infrastructure/database/supabase/SupabaseServiceRepository";

// Reads the session cookie, so it can never be rendered statically.
export const dynamic = "force-dynamic";

const serviceRepo = new SupabaseServiceRepository();

const BulkSchema = z.object({
  company_id: z.string().uuid(),
  action: z.enum(["activate", "deactivate", "delete"]),
  // Capped so one request can't hold a connection updating an unbounded id
  // list; the UI selects at most a page (<=100) at a time anyway.
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = BulkSchema.parse(await req.json());

    // Delete keeps its own permission tier: MANAGER can activate/deactivate
    // but only OWNER/ADMIN can destroy catalog entries.
    await requireCompanyAccess(req, parsed.company_id, parsed.action === "delete" ? "delete:services" : "write:services");

    // The repository also scopes by company_id in the WHERE clause, so ids
    // belonging to another tenant are silently ignored rather than mutated.
    const affected =
      parsed.action === "delete"
        ? await serviceRepo.bulkSoftDelete(parsed.company_id, parsed.ids)
        : await serviceRepo.bulkSetActive(parsed.company_id, parsed.ids, parsed.action === "activate");

    return formatApiResponse({ affected }, 200, `${affected} service${affected === 1 ? "" : "s"} ${parsed.action}d`);
  } catch (error) {
    return handleApiError(error);
  }
}
