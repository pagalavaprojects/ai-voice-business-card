import type { Metadata } from "next";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";

// Reads live data on every request — a card's name/photo/services can change
// at any time, and this is a public page with no user-specific auth to key a
// cache on.
export const dynamic = "force-dynamic";

const knowledgeRepo = new SupabaseKnowledgeRepository();

type Params = { companyId: string; employeeId: string };

// Best-effort only: this sets the browser tab title and link-preview text
// when the card is shared, but must never block or fail the page itself —
// the client component below does its own full fetch and renders its own
// honest not-found/unavailable state regardless of what happens here.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const [company, employee] = await Promise.all([
      knowledgeRepo.getCompanyById(params.companyId),
      knowledgeRepo.getEmployeeById(params.employeeId),
    ]);
    if (!company || !employee || employee.company_id !== params.companyId) {
      return { title: "Business card not found" };
    }
    return {
      title: `${employee.name} — ${company.name}`,
      description: `Talk to ${employee.name}'s AI voice business card for ${company.name}.`,
      // Once a short slug exists, it becomes the canonical URL — this long
      // form keeps working (already-printed QR codes must never break) but
      // search engines and share unfurls should prefer the memorable one.
      ...(employee.slug ? { alternates: { canonical: `/c/${employee.slug}` } } : {}),
    };
  } catch {
    return {};
  }
}

export default function VoiceBusinessCardPage({ params }: { params: Params }) {
  return <PublicBusinessCard companyId={params.companyId} employeeId={params.employeeId} />;
}
