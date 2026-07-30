import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";

const crmRepo = new SupabaseCRMRepository();

const AddNoteSchema = z.object({ company_id: z.string().uuid(), content: z.string().min(1).max(4000) });

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
  try {
    const body = await req.json();
    const parsed = AddNoteSchema.parse(body);

    const access = await requireCompanyAccess(req, parsed.company_id, "write:leads");

    const lead = await crmRepo.getLeadById(params.leadId);
    if (!lead || lead.company_id !== parsed.company_id) return formatApiResponse(null, 404, "Lead not found");

    const note = await crmRepo.addActivity(params.leadId, parsed.company_id, "NOTE", parsed.content, access.userId);
    return formatApiResponse(note, 201, "Note added successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
