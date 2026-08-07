import { NextRequest, NextResponse } from "next/server";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { promptAssemblyService, toolRegistry, agentRepo } from "@/core/infrastructure/bootstrap/assistantRuntime";
import { SupabaseSettingsRepository } from "@/core/infrastructure/database/supabase/SupabaseSettingsRepository";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";
import { Logger } from "@/shared/lib/logger";
import { resolveVoiceProviderConfig } from "@/shared/lib/voice";
import { resolvePublicBaseUrl } from "@/shared/lib/publicUrl";
import { createWebhookToken } from "@/shared/lib/webhookToken";
import { isEmployeeCardVisible } from "@/shared/lib/employeeVisibility";
import {
  resolveRequestLanguage,
  resolveGreeting,
  getLanguageDirective,
  resolveSuggestedQuestions,
  isSupportedLanguage,
  DEFAULT_LANGUAGE,
  getLanguageDefinition,
} from "@/features/language/server";
import QRCode from "qrcode";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const knowledgeRepo = new SupabaseKnowledgeRepository();
const settingsRepo = new SupabaseSettingsRepository();
const storage = new SupabaseStorageAdapter();

const DEFAULT_FIRST_MESSAGE = "Hello! Thank you for scanning my business card. How can I help you today?";

/** wa.me requires a bare international number — no +, spaces or punctuation.
 * Returns null rather than a broken link when the stored phone can't produce
 * a plausible number, so the UI can hide the action instead of offering a
 * WhatsApp button that opens an error page. */
function toWhatsappUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

/** QR encoding this card's own URL, so it can be shown on a screen for
 * someone else to scan. Prefers the short /c/{slug} path when one is set —
 * it's what the card is meant to be printed and shared as — falling back to
 * the permanent long-form URL otherwise. Returns null on failure — a missing
 * QR should hide one optional action, never fail the whole card request. */
async function renderCardQr(origin: string, companyId: string, employeeId: string, slug: string | null | undefined): Promise<string | null> {
  try {
    const base = resolvePublicBaseUrl(origin) ?? origin;
    const target = slug ? `${base}/c/${slug}` : `${base}/${companyId}/${employeeId}`;
    return await QRCode.toString(target, {
      type: "svg",
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  } catch (err) {
    Logger.warn("QR generation failed for business card", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Intentionally unauthenticated — this is the data behind the public
 * voice business card (whoever scans the card's QR/NFC hits this route
 * with no session), unlike everything under /api/admin/*.
 *
 * This does return the assembled system prompt and tool definitions,
 * which is a real tradeoff: the browser needs them to start a live Vapi
 * call with `@vapi-ai/web`'s client SDK, which sends its assistant
 * config directly to Vapi from the browser — so the prompt is visible
 * in devtools network traffic either way once a call starts. Routing it
 * through our own endpoint first doesn't newly expose anything a call
 * wasn't already going to transmit from the browser; it just makes the
 * previously-unused server-side prompt assembly actually reach the
 * client call instead of every live call running a bare, prompt-less
 * model. serverUrl is also returned so tool-calls and the end-of-call
 * report route back to our webhook during the call. */
export async function GET(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  const { companyId, employeeId } = params;

  try {
    const [company, employee] = await Promise.all([
      knowledgeRepo.getCompanyById(companyId),
      knowledgeRepo.getEmployeeById(employeeId),
    ]);

    // See isEmployeeCardVisible: only an explicit `false` takes a card offline,
    // so a database that has not applied migration 20260807 yet keeps serving
    // every card instead of 404ing all of them.
    if (!company || !employee || employee.company_id !== companyId || !isEmployeeCardVisible(employee)) {
      return NextResponse.json({ message: "Business card not found" }, { status: 404 });
    }

    // Everything the card renders is fetched together: a visitor who scans a
    // QR code should get one round trip, not a waterfall of requests while
    // they stare at a spinner. Each degrades to empty independently so one
    // missing table never blanks the whole card.
    const [agent, services, products, faqs, settings, branding] = await Promise.all([
      agentRepo.getAgentByEmployee(employeeId).catch(() => null),
      knowledgeRepo.getServicesByCompany(companyId).catch(() => []),
      knowledgeRepo.getProductsByCompany(companyId).catch(() => []),
      knowledgeRepo.getFAQsByCompany(companyId).catch(() => []),
      settingsRepo.getSettings(companyId).catch(() => null),
      settingsRepo.getBranding(companyId).catch(() => null),
    ]);

    // The "Book Meeting" button previously always opened a hard-coded
    // cal.com/demo/30min link — a real dead end for any visitor who clicked
    // it. Only surface the button when this company has actually configured
    // a booking URL.
    const configuredBookingUrl = (settings?.calendar_settings as Record<string, unknown> | undefined)?.booking_url;
    const bookingUrl = typeof configuredBookingUrl === "string" && configuredBookingUrl.startsWith("http") ? configuredBookingUrl : null;

    // No ?lang= at all (an older client, a direct API caller, this project's
    // own webhook/tests) must behave byte-for-byte like before multilingual
    // support existed — so it resolves to whatever the agent's greeting is
    // already tagged as, not the platform's Tamil default. Only an EXPLICIT
    // ?lang= choice (the visitor actually opening the language selector)
    // engages real per-language resolution.
    const langParam = req.nextUrl.searchParams.get("lang");
    const language = langParam
      ? resolveRequestLanguage(langParam)
      : isSupportedLanguage(agent?.welcome_message_language)
        ? agent!.welcome_message_language!
        : DEFAULT_LANGUAGE;

    const [systemPromptBase] = await Promise.all([
      promptAssemblyService.assembleSystemPrompt(companyId, employeeId).catch((err) => {
        Logger.warn("System prompt assembly failed, live call will run without one", {
          companyId,
          employeeId,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }),
    ]);
    // The language directive is appended, not cached with the base prompt —
    // the assembled prompt itself is identical regardless of language, so
    // there's no need to cache a variant per language, only to suffix it.
    const systemPrompt = systemPromptBase ? systemPromptBase + getLanguageDirective(language) : systemPromptBase;

    // Vapi delivers tool-calls from its own cloud, so a localhost callback is
    // unreachable and every save_lead / book_appointment would silently never
    // arrive. Rather than advertise tools the assistant cannot actually
    // fulfil — which surfaces to the visitor as a broken promise mid-call —
    // withhold both the callback and the tools, and say so in the logs.
    // The callback URL carries a signed token because the browser's inline
    // assistant config overrides the dashboard's server settings, so Vapi
    // sends an empty x-vapi-secret and a dashboard credential can never
    // authenticate these calls. Signing here keeps VAPI_WEBHOOK_SECRET on the
    // server — the client only ever receives a scoped, expiring HMAC.
    const publicBaseUrl = resolvePublicBaseUrl(req.nextUrl.origin);
    const webhookToken = createWebhookToken(companyId, employeeId);
    const serverUrl = publicBaseUrl
      ? `${publicBaseUrl}/api/vapi/webhook?companyId=${encodeURIComponent(companyId)}&employeeId=${encodeURIComponent(employeeId)}` +
        `&lang=${encodeURIComponent(language)}` +
        (webhookToken ? `&token=${encodeURIComponent(webhookToken)}` : "")
      : undefined;

    if (!serverUrl) {
      Logger.warn(
        "No publicly reachable base URL — voice tools (save_lead, book_appointment) are disabled for this call. " +
          "Set PUBLIC_BASE_URL to a public HTTPS origin (a tunnel such as ngrok in local development, or the deployed domain).",
        { companyId, employeeId, requestOrigin: req.nextUrl.origin }
      );
    }

    const voiceConfig = resolveVoiceProviderConfig(
      employee.voice_id,
      agent?.voice_model_id,
      (settings?.voice_settings as Record<string, unknown> | undefined)?.default_voice_model as string | undefined
    );

    return NextResponse.json({
      company: {
        name: company.name,
        website: company.website,
        logoUrl: company.logo_url,
      },
      employee: {
        name: employee.name,
        designation: employee.designation,
        email: employee.email,
        phone: employee.phone,
        officeAddress: employee.office_address,
        workingHours: employee.working_hours,
        // The employee's own photo wins over the agent artwork: the card is a
        // person's business card, and the agent avatar is a fallback for
        // employees who haven't uploaded one.
        avatarUrl: employee.avatar_path
          ? storage.getPublicUrl("employee-avatars", employee.avatar_path)
          : agent?.avatar_url ?? null,
        timezone: employee.timezone ?? null,
      },
      branding: {
        primaryColor: branding?.primary_color ?? null,
        secondaryColor: branding?.secondary_color ?? null,
      },
      // Already active-only and display-ordered from the repository, same as
      // products. Short description preferred on the card when present — the
      // full description is what the AI uses in conversation.
      services: services.map((s) => ({
        name: s.name,
        description: s.short_description?.trim() || s.description,
        deliverables: s.deliverables,
        timeline: s.timeline,
        price: s.price,
        currency: s.currency,
        imageUrl: s.image_path ? storage.getPublicUrl("service-images", s.image_path) : null,
        featured: s.is_featured,
        cta: s.cta_label && s.cta_url ? { label: s.cta_label, url: s.cta_url } : null,
      })),
      // Already active-only and display-ordered from the repository. The
      // short description is preferred on the card when present — the full
      // description is what the AI uses in conversation.
      products: products.map((p) => ({
        name: p.name,
        description: p.short_description?.trim() || p.description,
        benefits: p.benefits,
        pricing: p.pricing,
        currency: p.currency,
        discountPercent: p.discount_percent > 0 ? p.discount_percent : null,
        imageUrl: p.image_path ? storage.getPublicUrl("product-images", p.image_path) : null,
        featured: p.is_featured,
        cta: p.cta_label && p.cta_url ? { label: p.cta_label, url: p.cta_url } : null,
      })),
      // The visitor's opening problem is "what do I even ask a voice AI?".
      // Real FAQ questions (provably answerable) are used when the
      // conversation language matches how they're authored; otherwise a
      // curated, hand-translated fallback list ships per language — see
      // resolveSuggestedQuestions.
      suggestedQuestions: resolveSuggestedQuestions(language, faqs.slice(0, 4).map((f) => f.question)),
      socialLinks: employee.social_links ?? {},
      // Rendered server-side into an inline SVG so the QR library never
      // reaches the client bundle — the card is the first thing a visitor
      // loads, often on mobile data, and this keeps it off the critical path.
      qrSvg: await renderCardQr(req.nextUrl.origin, companyId, employeeId, employee.slug),
      // Derived, not stored: a wa.me link needs the number stripped to digits.
      whatsappUrl: toWhatsappUrl(employee.phone),
      bookingUrl,
      firstMessage: langParam
        ? resolveGreeting(agent, company, employee, language)
        : agent?.first_message?.trim() || DEFAULT_FIRST_MESSAGE,
      systemPrompt,
      tools: serverUrl ? toolRegistry.getAllToolDefinitions() : [],
      toolsEnabled: Boolean(serverUrl),
      serverUrl,
      voiceId: voiceConfig.voiceId,
      voiceProvider: voiceConfig.provider,
      voiceModel: voiceConfig.model,
      // Echoes back what was actually resolved (not just what was
      // requested) — the effective language even when ?lang= was absent,
      // and the Deepgram transcriber code the client should pass to
      // useVapiSession for speech recognition to match.
      language,
      speechLocale: getLanguageDefinition(language).speechLocale,
    });
  } catch (err) {
    // Supabase unreachable/unconfigured (e.g. placeholder credentials) is
    // an infrastructure condition, not "this card doesn't exist" — the
    // client falls back to a local demo card either way, but the status
    // code distinguishes the two cases for anyone debugging deployment.
    Logger.warn("Public business card lookup failed", { companyId, employeeId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ message: "Business card service unavailable" }, { status: 503 });
  }
}
