import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseServiceRepository } from "@/core/infrastructure/database/supabase/SupabaseServiceRepository";

// Reads the session cookie, so it can never be rendered statically.
export const dynamic = "force-dynamic";

const serviceRepo = new SupabaseServiceRepository();

const BodySchema = z.object({ company_id: z.string().uuid() });

export async function POST(req: NextRequest, { params }: { params: { serviceId: string } }) {
  try {
    const { company_id } = BodySchema.parse(await req.json());
    await requireCompanyAccess(req, company_id, "write:services");

    const source = await serviceRepo.getServiceById(params.serviceId);
    if (!source || source.company_id !== company_id) return formatApiResponse(null, 404, "Service not found");

    // The copy starts INACTIVE on purpose: duplicating is usually the first
    // step of "make a variant", and a half-edited variant must not appear on
    // the public card or be pitched by the AI before the admin finishes it.
    const copy = await serviceRepo.createService({
      company_id: source.company_id,
      name: `${source.name} (copy)`,
      description: source.description,
      deliverables: source.deliverables ?? [],
      timeline: source.timeline ?? "",
      price: source.price,
      currency: source.currency ?? "USD",
      // Slug is unique per company; suffix rather than failing the duplicate
      // on the unique index.
      slug: source.slug ? `${source.slug}-copy-${Date.now().toString(36)}`.slice(0, 160) : null,
      short_description: source.short_description,
      category: source.category,
      image_path: source.image_path,
      cta_label: source.cta_label,
      cta_url: source.cta_url,
      display_order: source.display_order ?? 0,
      is_featured: false,
      is_active: false,
    });

    return formatApiResponse(copy, 201, "Service duplicated — the copy is inactive until you publish it");
  } catch (error) {
    return handleApiError(error);
  }
}
