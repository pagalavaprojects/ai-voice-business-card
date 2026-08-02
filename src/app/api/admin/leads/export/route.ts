import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const crmRepo = new SupabaseCRMRepository();
const storage = new SupabaseStorageAdapter();

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

/**
 * Exports every lead matching the filter (not just the page currently
 * loaded in the browser, unlike the client-side CSV export on the Leads
 * page), writes it to the "exports" storage bucket, and returns a
 * time-limited signed URL — real server-side generation + storage rather
 * than just a client-side Blob download.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:leads");

    const status = req.nextUrl.searchParams.get("status") || undefined;

    const allRows: Array<Record<string, unknown>> = [];
    let offset = 0;
    const pageSize = 200;
    // Page through everything server-side; a dashboard export should never
    // be capped at the UI's page size.
    for (;;) {
      const { leads, total } = await crmRepo.listLeads({ company_id: companyId, status, limit: pageSize, offset });
      allRows.push(
        ...leads.map((l) => ({
          name: l.name,
          email: l.email,
          phone: l.phone,
          business_name: l.business_name || "",
          score: l.score,
          score_category: l.score_category,
          status: l.status,
          created_at: l.created_at,
        }))
      );
      offset += pageSize;
      if (offset >= total || leads.length === 0) break;
    }

    const csv = toCsv(allRows);
    const path = `${companyId}/leads_${Date.now()}.csv`;

    await storage.ensureBucket("exports", false);
    await storage.upload("exports", path, Buffer.from(csv, "utf-8"), "text/csv");
    const signedUrl = await storage.getSignedUrl("exports", path, 300);

    return formatApiResponse({ url: signedUrl, rowCount: allRows.length }, 200, `Exported ${allRows.length} leads`);
  } catch (error) {
    return handleApiError(error);
  }
}
