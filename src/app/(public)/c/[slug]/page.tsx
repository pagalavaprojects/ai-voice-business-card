import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";

// This route resolves a short slug to a live database row on every request,
// so it can never be statically prerendered.
export const dynamic = "force-dynamic";

const knowledgeRepo = new SupabaseKnowledgeRepository();

type Params = { slug: string };

// A genuinely unknown slug is a 404, not an error: notFound() renders the
// app's existing not-found page. A real infrastructure failure (the
// repository throwing rather than returning null) is deliberately left
// uncaught here so it reaches error.tsx instead of being misreported as
// "this card doesn't exist" — those are two different situations for a
// visitor and for whoever is debugging.
async function resolveEmployee(slug: string) {
  const employee = await knowledgeRepo.getEmployeeBySlug(slug);
  if (!employee) notFound();
  return employee;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const employee = await knowledgeRepo.getEmployeeBySlug(params.slug);
    if (!employee) return {};
    const company = await knowledgeRepo.getCompanyById(employee.company_id);
    if (!company) return {};
    return {
      title: `${employee.name} — ${company.name}`,
      description: `Talk to ${employee.name}'s AI voice business card for ${company.name}.`,
      alternates: { canonical: `/c/${params.slug}` },
    };
  } catch {
    return {};
  }
}

export default async function ShortLinkBusinessCardPage({ params }: { params: Params }) {
  const employee = await resolveEmployee(params.slug);
  return <PublicBusinessCard companyId={employee.company_id} employeeId={employee.id} />;
}
