import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { buildCardMetadata, buildCardJsonLd, serializeJsonLd } from "@/shared/lib/cardMetadata";

// This route resolves a short slug to a live database row on every request,
// so it can never be statically prerendered.
export const dynamic = "force-dynamic";

const knowledgeRepo = new SupabaseKnowledgeRepository();

type Params = { slug: string };

// generateMetadata and the page component are separate Next entry points
// that would otherwise each resolve the slug independently. React's cache()
// dedupes them to one round trip per field for a given request.
const getCardBySlug = cache(async (slug: string) => {
  const employee = await knowledgeRepo.getEmployeeBySlug(slug);
  if (!employee) return null;
  const company = await knowledgeRepo.getCompanyById(employee.company_id);
  if (!company) return null;
  return { employee, company };
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const card = await getCardBySlug(params.slug);
    if (!card) return {};
    return buildCardMetadata({ employee: card.employee, company: card.company, canonicalPath: `/c/${params.slug}` });
  } catch {
    return {};
  }
}

export default async function ShortLinkBusinessCardPage({ params }: { params: Params }) {
  // A genuinely unknown slug is a 404, not an error: notFound() renders the
  // app's existing not-found page. A real infrastructure failure (getCardBySlug
  // throwing rather than returning null) is deliberately left uncaught here so
  // it reaches error.tsx instead of being misreported as "this card doesn't
  // exist" — those are two different situations for a visitor and for
  // whoever is debugging.
  const card = await getCardBySlug(params.slug);
  if (!card) notFound();
  const { employee, company } = card;

  // JSON-LD is read by search-engine crawlers, not by any third-party
  // callback, so unlike resolvePublicBaseUrl (used for Vapi/Cal.com, which
  // must reach a genuinely public address) a request-derived origin is fine
  // here even in local development — it just describes "this page," it isn't
  // asked to receive anything.
  const host = headers().get("host") ?? (process.env.NEXT_PUBLIC_APP_URL || "https://maylaanai.com").replace(/^https?:\/\//, "");
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const jsonLd = buildCardJsonLd({ employee, company, canonicalUrl: `${protocol}://${host}/c/${params.slug}` });

  return (
    <>
      {/* Structured data for search engines — has no effect on rendering or
          behavior. See buildCardJsonLd for why the content is escaped. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <PublicBusinessCard companyId={employee.company_id} employeeId={employee.id} />
    </>
  );
}
