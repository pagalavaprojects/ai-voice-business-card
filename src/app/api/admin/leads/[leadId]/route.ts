import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { SupabaseConversationRepository } from "@/core/infrastructure/database/supabase/SupabaseConversationRepository";
import { LeadStatus } from "@/core/domain/models/types";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const crmRepo = new SupabaseCRMRepository();
const bookingRepo = new SupabaseBookingRepository();
const conversationRepo = new SupabaseConversationRepository();

const UpdateLeadSchema = z.object({
  company_id: z.string().uuid(),
  status: z.nativeEnum(LeadStatus).optional(),
  owner_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

/** Detail view: lead + activity timeline + appointment history, in one
 * round trip so the dashboard's lead detail panel doesn't need three
 * separate authorized requests. */
export async function GET(req: NextRequest, { params }: { params: { leadId: string } }) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:leads");

    const lead = await crmRepo.getLeadById(params.leadId);
    if (!lead || lead.company_id !== companyId) {
      return formatApiResponse(null, 404, "Lead not found");
    }

    const [activity, appointments, conversation] = await Promise.all([
      crmRepo.getActivityTimeline(lead.id),
      bookingRepo.getAppointmentsByLead(lead.id),
      lead.conversation_id ? conversationRepo.getConversationById(lead.conversation_id) : Promise.resolve(null),
    ]);

    return formatApiResponse(
      { lead, activity, appointments, conversation },
      200,
      "Lead detail retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { leadId: string } }) {
  try {
    const body = await req.json();
    const parsed = UpdateLeadSchema.parse(body);

    const access = await requireCompanyAccess(req, parsed.company_id, "write:leads");

    let lead = await crmRepo.getLeadById(params.leadId);
    if (!lead || lead.company_id !== parsed.company_id) {
      return formatApiResponse(null, 404, "Lead not found");
    }

    if (parsed.status) lead = await crmRepo.updateLeadStatus(params.leadId, parsed.status, access.userId);
    if (parsed.owner_id !== undefined) lead = await crmRepo.updateLeadOwner(params.leadId, parsed.owner_id, access.userId);
    if (parsed.tags) lead = await crmRepo.updateLeadTags(params.leadId, parsed.tags);

    return formatApiResponse(lead, 200, "Lead updated successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { leadId: string } }) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "delete:leads");

    const lead = await crmRepo.getLeadById(params.leadId);
    if (!lead || lead.company_id !== companyId) {
      return formatApiResponse(null, 404, "Lead not found");
    }

    await crmRepo.softDeleteLead(params.leadId);
    return formatApiResponse(null, 200, "Lead deleted successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
