import type { Metadata } from "next";
import { Company, Employee } from "@/core/domain/models/types";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";

const storage = new SupabaseStorageAdapter();

/** Shared by both public card routes (/{companyId}/{employeeId} and
 * /c/{slug}) so a card's title, description, and share-link preview are
 * identical no matter which URL someone opens it from. */
export function buildCardMetadata({
  employee,
  company,
  canonicalPath,
}: {
  employee: Employee;
  company: Company;
  /** e.g. "/c/srinivasan" or "/{companyId}/{employeeId}" — whichever URL
   * should be treated as canonical for search engines and link unfurls. */
  canonicalPath: string;
}): Metadata {
  const title = `${employee.name} — ${company.name}`;
  const description = `Talk to ${employee.name}, ${employee.designation} at ${company.name}, on their AI voice business card. Ask a question out loud and get an instant answer.`;
  const avatarUrl = employee.avatar_path ? storage.getPublicUrl("employee-avatars", employee.avatar_path) : undefined;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      type: "profile",
      url: canonicalPath,
      siteName: `${company.name} — AI Voice Business Card`,
      ...(avatarUrl ? { images: [{ url: avatarUrl, alt: `${employee.name}, ${employee.designation} at ${company.name}` }] } : {}),
    },
    twitter: {
      card: avatarUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(avatarUrl ? { images: [avatarUrl] } : {}),
    },
  };
}

/** schema.org Person structured data for the card — rendered as a
 * <script type="application/ld+json"> in the page body (Next's Metadata API
 * has no first-class field for structured data). Search engines use this for
 * rich results (a person/profile card rather than a bare blue link); it has
 * no effect on the page's own rendering or behavior. */
export function buildCardJsonLd({
  employee,
  company,
  canonicalUrl,
}: {
  employee: Employee;
  company: Company;
  /** Full absolute URL — schema.org identifiers are expected to be
   * resolvable, unlike the metadata canonical path above which Next resolves
   * against metadataBase itself. */
  canonicalUrl: string;
}): Record<string, unknown> {
  const avatarUrl = employee.avatar_path ? storage.getPublicUrl("employee-avatars", employee.avatar_path) : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: employee.name,
    jobTitle: employee.designation,
    url: canonicalUrl,
    ...(avatarUrl ? { image: avatarUrl } : {}),
    ...(employee.email ? { email: employee.email } : {}),
    ...(employee.phone ? { telephone: employee.phone } : {}),
    worksFor: {
      "@type": "Organization",
      name: company.name,
      ...(company.website ? { url: company.website } : {}),
      ...(company.logo_url ? { logo: company.logo_url } : {}),
    },
  };
}

/** schema.org WebSite + SearchAction structured data for search engine discovery. */
export function buildWebsiteJsonLd(baseUrl = "https://maylaanai.com"): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Maylaan AI",
    alternateName: "Maylaan AI Voice Business Card Platform",
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** schema.org FAQPage structured data for suggested questions on the card. */
export function buildFaqJsonLd(questions: string[]): Record<string, unknown> | null {
  if (!questions || questions.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: `Ask this question directly to the AI Twin on the voice card.`,
      },
    })),
  };
}

/** Serializes JSON-LD for a <script> tag. Escapes `<` so admin-authored text
 * (a name, a designation) can never smuggle a literal `</script>` and break
 * out of the tag — the same reason Next's own rendering escapes this
 * character in inline scripts. */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
