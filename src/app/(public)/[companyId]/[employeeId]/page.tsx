import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { buildCardMetadata, buildCardJsonLd, serializeJsonLd } from "@/shared/lib/cardMetadata";

// Reads live data on every request — a card's name/photo/services can change
// at any time, and this is a public page with no user-specific auth to key a
// cache on.
export const dynamic = "force-dynamic";

const knowledgeRepo = new SupabaseKnowledgeRepository();

type Params = { companyId: string; employeeId: string };

// generateMetadata and the page component are separate Next entry points
// that would otherwise each issue their own company+employee reads for the
// same request. React's cache() dedupes them to one round trip per field.
const getCard = cache(async (companyId: string, employeeId: string) => {
  const [company, employee] = await Promise.all([
    knowledgeRepo.getCompanyById(companyId),
    knowledgeRepo.getEmployeeById(employeeId),
  ]);
  if (!company || !employee || employee.company_id !== companyId) return null;
  return { company, employee };
});

// Best-effort only: this sets the browser tab title and link-preview text
// when the card is shared, but must never block or fail the page itself —
// the client component below does its own full fetch and renders its own
// honest not-found/unavailable state regardless of what happens here.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const card = await getCard(params.companyId, params.employeeId);
    if (!card) return { title: "Business card not found" };
    return buildCardMetadata({
      employee: card.employee,
      company: card.company,
      // Once a short slug exists, it becomes the canonical URL — this long
      // form keeps working (already-printed QR codes must never break) but
      // search engines and share unfurls should prefer the memorable one.
      canonicalPath: card.employee.slug ? `/c/${card.employee.slug}` : `/${params.companyId}/${params.employeeId}`,
    });
  } catch {
    return {};
  }
}

export default async function VoiceBusinessCardPage({ params }: { params: Params }) {
  const card = await getCard(params.companyId, params.employeeId).catch(() => null);

  // No JSON-LD for an unresolved card — PublicBusinessCard renders its own
  // honest not-found/unavailable state client-side; there's nothing true to
  // describe to a search engine here.
  const jsonLd = card
    ? (() => {
        const host = headers().get("host") ?? "ai-voice-business-card.vercel.app";
        const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
        return buildCardJsonLd({
          employee: card.employee,
          company: card.company,
          canonicalUrl: `${protocol}://${host}/${params.companyId}/${params.employeeId}`,
        });
      })()
    : null;

  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}
      <PublicBusinessCard companyId={params.companyId} employeeId={params.employeeId} />
    </>
  );
}
