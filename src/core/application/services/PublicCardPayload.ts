import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { promptAssemblyService, agentRepo, toolRegistry } from "@/core/infrastructure/bootstrap/assistantRuntime";
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
  resolveTranscriberConfig,
  resolveCompanyLanguageSettings,
  clampToEnabledLanguages,
  resolveEnabledLanguageList,
  isSupportedLanguage,
  DEFAULT_LANGUAGE,
} from "@/features/language/server";
import QRCode from "qrcode";

/**
 * Assembles the complete public business-card payload.
 *
 * Extracted verbatim from the /api/public/[companyId]/[employeeId] route on
 * 2026-08-19 so the card PAGE (a server component) can build the exact same
 * data during server rendering and hand it to the client as initial props —
 * removing the client-side fetch from the first-paint critical path — while
 * the API route keeps serving the identical payload for language switches
 * and any older client. ONE code path for the card's data, two transports.
 *
 * Returns null for "card not found" (unknown ids, cross-tenant mismatch,
 * hidden card). Infrastructure failures throw — the two callers map those to
 * their own 503/error boundaries.
 */

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

export interface BuildPublicCardPayloadInput {
  companyId: string;
  employeeId: string;
  /** The raw ?lang= value (or cookie value from the SSR path); null/absent
   * keeps the pre-multilingual default-resolution behavior. */
  langParam: string | null;
  /** The request's own origin — used for the QR target and, via
   * resolvePublicBaseUrl, the webhook/TTS callback URLs. */
  requestOrigin: string;
}

export async function buildPublicCardPayload({ companyId, employeeId, langParam, requestOrigin }: BuildPublicCardPayloadInput) {
  // Everything the card renders is fetched together in ONE round trip: a
  // visitor who scans a QR code should get one batch, not a waterfall of
  // requests while they stare at a spinner. The six auxiliary reads key
  // only off the URL-provided ids — none consume any field of the
  // company/employee rows — so they ride in the SAME batch as the identity
  // pair (2026-08-19 audit: they previously waited for it, costing a full
  // extra serial DB round trip on the hottest public request; the price is
  // six discarded reads on the rare unknown-id request, which the route's
  // rate limiter already bounds). Each degrades to empty independently so
  // one missing table never blanks the whole card.
  const [company, employee, agent, services, products, faqs, settings, branding] = await Promise.all([
    knowledgeRepo.getCompanyById(companyId),
    knowledgeRepo.getEmployeeById(employeeId),
    agentRepo.getAgentByEmployee(employeeId).catch(() => null),
    knowledgeRepo.getServicesByCompany(companyId).catch(() => []),
    knowledgeRepo.getProductsByCompany(companyId).catch(() => []),
    knowledgeRepo.getFAQsByCompany(companyId).catch(() => []),
    settingsRepo.getSettings(companyId).catch(() => null),
    settingsRepo.getBranding(companyId).catch(() => null),
  ]);

  // See isEmployeeCardVisible: only an explicit `false` takes a card offline,
  // so a database that has not applied migration 20260807 yet keeps serving
  // every card instead of 404ing all of them.
  if (!company || !employee || employee.company_id !== companyId || !isEmployeeCardVisible(employee)) {
    return null;
  }

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
  // ?lang= choice (the visitor actually opening the language selector, or
  // the SSR path reading their persisted cookie) engages real per-language
  // resolution.
  const companyLanguageSettings = resolveCompanyLanguageSettings(settings?.language_settings as Record<string, unknown> | undefined);
  const language = clampToEnabledLanguages(
    langParam
      ? resolveRequestLanguage(langParam)
      : isSupportedLanguage(agent?.welcome_message_language)
        ? agent!.welcome_message_language!
        : companyLanguageSettings.defaultLanguage ?? DEFAULT_LANGUAGE,
    companyLanguageSettings
  );

  const systemPromptBase = await promptAssemblyService
    .assembleSystemPrompt(companyId, employeeId, undefined, { company, employee, products, services, faqs })
    .catch((err) => {
      Logger.warn("System prompt assembly failed, live call will run without one", {
        companyId,
        employeeId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
  // The language directive is appended, not cached with the base prompt —
  // the assembled prompt itself is identical regardless of language, so
  // there's no need to cache a variant per language, only to suffix it.
  //
  // The qualification script is deliberately NOT appended here. This
  // systemPrompt is shared by BOTH the plain "Talk with AI" mic tap AND the
  // booking modal's "Start AI Conversation" — appending the qualification
  // directive unconditionally would tell a visitor just asking about
  // products, in a normal general conversation, "this is a strict
  // closed-ended questionnaire, never ask for explanations." The client
  // (PublicBusinessCard) appends getQualificationDirective() itself, ONLY
  // for the qualification call, via startCall's systemPrompt override — the
  // same mechanism firstMessage already uses to keep the qualification
  // opening out of the general greeting.
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
  const publicBaseUrl = resolvePublicBaseUrl(requestOrigin);
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
      { companyId, employeeId, requestOrigin }
    );
  }

  const voiceConfig = resolveVoiceProviderConfig(
    employee.voice_id,
    agent?.voice_model_id,
    (settings?.voice_settings as Record<string, unknown> | undefined)?.default_voice_model as string | undefined,
    // Context for the opt-in custom-voice branch: with it, the resolved
    // config can carry a signed /api/tts/vapi URL (same base-URL and
    // HMAC-token trust model as serverUrl above). Without a public base
    // URL this falls through to the standard provider chain.
    { language, companyId, employeeId, baseUrl: publicBaseUrl }
  );

  return {
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
    qrSvg: await renderCardQr(requestOrigin, companyId, employeeId, employee.slug),
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
    // Only set for provider "custom-voice": the signed URL Vapi must POST
    // voice-requests to. Null (not omitted) so the client can distinguish
    // "server said no custom voice" from "old server without the field".
    voiceServerUrl: voiceConfig.serverUrl ?? null,
    // Echoes back what was actually resolved (not just what was
    // requested) — the effective language even when ?lang= was absent,
    // and the full transcriber spec (provider + model + locale) the
    // client should pass to useVapiSession for speech recognition to
    // match. A single object rather than parallel fields because the
    // OpenAI transcriber (Tamil/Kannada) additionally requires its
    // `model` — splitting three coupled values across loose fields is
    // how the deepgram/ta mismatch shipped in the first place.
    language,
    transcriber: resolveTranscriberConfig(language),
    // The company's actual enabled-language set (or every platform
    // language when unrestricted) — the header selector and the
    // pre-conversation gate both only ever offer what's in this list, so
    // a visitor can never pick a language this company has switched off.
    enabledLanguages: resolveEnabledLanguageList(companyLanguageSettings),
  };
}

export type PublicCardPayload = NonNullable<Awaited<ReturnType<typeof buildPublicCardPayload>>>;
