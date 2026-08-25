import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess, requireCompanyDataScope } from "@/shared/lib/tenant";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const crmRepo = new SupabaseCRMRepository();

const AddNoteSchema = z.object({ company_id: z.string().uuid(), content: z.string().min(1).max(4000) });

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
  try {
    const body = await req.json();
    const parsed = AddNoteSchema.parse(body);

    const { access, employeeId } = await requireCompanyDataScope(req, parsed.company_id, "write:leads");

    const lead = await crmRepo.getLeadById(params.leadId);
    // employeeId was resolved above and then never consulted, so a staff
    // account could write a note onto a colleague's lead — confirmed in
    // production, which answered 201 and stored the row. A refused write
    // returns the same 404 as a missing lead so it never confirms existence.
    if (!lead || lead.company_id !== parsed.company_id || (employeeId && lead.employee_id !== employeeId)) {
      return formatApiResponse(null, 404, "Lead not found");
    }

    const note = await crmRepo.addActivity(params.leadId, parsed.company_id, "NOTE", parsed.content, access.userId);
    return formatApiResponse(note, 201, "Note added successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
