import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatApiResponse, validateVapiWebhookSignature, isPlaceholderCredential } from "@/shared/lib/security";
import { SupabaseConversationRepository } from "@/core/infrastructure/database/supabase/SupabaseConversationRepository";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";
import { withSpan, httpRequestDuration, voiceCallsTotal } from "@/core/infrastructure/telemetry/otel";
import { promptAssemblyService, toolRegistry, agentRepo, settingsRepo } from "@/core/infrastructure/bootstrap/assistantRuntime";
import { Logger } from "@/shared/lib/logger";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { resolveVoiceProviderConfig } from "@/shared/lib/voice";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { verifyWebhookToken } from "@/shared/lib/webhookToken";
import { resolvePublicBaseUrl } from "@/shared/lib/publicUrl";
import { getWhatsAppNotifier } from "@/core/infrastructure/notifications/WhatsAppNotifier";
import { SupabaseWhatsAppIdempotencyStore } from "@/core/infrastructure/notifications/WhatsAppIdempotency";
import {
  deriveConversationIntent,
  extractVisitorLines,
  sendConversationSummaryToOwner,
} from "@/core/application/services/ConversationSummaryNotifier";
import {
  resolveRequestLanguage,
  resolveGreeting,
  getLanguageDirective,
  resolveTranscriberConfig,
  resolveCompanyLanguageSettings,
  clampToEnabledLanguages,
  isSupportedLanguage,
  DEFAULT_LANGUAGE,
} from "@/features/language/server";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const conversationRepo = new SupabaseConversationRepository();
const knowledgeRepo = new SupabaseKnowledgeRepository();
const storage = new SupabaseStorageAdapter();

// The end-of-call report downloads the call recording from Vapi and re-uploads
// it to our own storage bucket, which for a long call is well over Vercel's
// 10s default. A timeout here loses the whole report — transcript, lead score
// and appointment linkage — not just the recording.
export const maxDuration = 60;

interface VapiMessage {
  type?: string;
  call?: { id?: string; customer?: { extension?: string } };
  toolCalls?: Array<{ id: string; function: { name: string; arguments: Record<string, unknown> } }>;
  durationSeconds?: number;
  duration?: number;
  summary?: string;
  transcript?: string;
  artifact?: { transcript?: string; recordingUrl?: string };
  analysis?: { summary?: string; successEvaluation?: string; sentiment?: string };
  recordingUrl?: string;
  endedReason?: string;
}

/** Best-effort: downloads a call recording from the URL Vapi provides and
 * re-uploads it into our own "voice-assets" bucket, so a recording
 * survives independently of Vapi's own retention window. Failure here
 * must never fail the whole webhook — the conversation row is still
 * valuable without the recording. */
async function archiveRecording(companyId: string, conversationId: string, recordingUrl: string): Promise<string | null> {
  try {
    const response = await fetch(recordingUrl);
    if (!response.ok) {
      // Previously returned null with no log at all, so a permanently failing
      // archive was indistinguishable from "no recording was offered".
      //
      // Vapi stores recordings in its own private bucket and hands over a bare
      // object URL with no presigned query string, so an unauthenticated GET
      // is rejected (R2: InvalidArgument/Authorization). Downloading it needs
      // Vapi credentials — with VAPI_API_KEY still a placeholder this cannot
      // succeed, and that is worth stating once per call rather than failing
      // invisibly. The conversation itself is unaffected: the original URL is
      // retained in audio_metadata, so the recording stays retrievable.
      Logger.warn("Call recording not archived: source URL rejected the download", {
        status: response.status,
        vapiApiKeyConfigured: !isPlaceholderCredential(process.env.VAPI_API_KEY),
      });
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "audio/wav";
    const extension = contentType.includes("mp3") ? "mp3" : contentType.includes("ogg") ? "ogg" : "wav";
    const path = `${companyId}/${conversationId}.${extension}`;

    await storage.ensureBucket("voice-assets", false);
    await storage.upload("voice-assets", path, buffer, contentType);
    return path;
  } catch (err) {
    Logger.warn("Failed to archive Vapi call recording", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function handleVapiMessage(req: NextRequest, message: VapiMessage): Promise<Response> {
  // 1. Handle Vapi Assistant Request (Dynamic Prompt Assembly)
  if (message.type === "assistant-request") {
    const companyId = message.call?.customer?.extension || req.nextUrl.searchParams.get("companyId");
    const employeeId = req.nextUrl.searchParams.get("employeeId");

    if (!companyId || !employeeId) {
      return formatApiResponse(null, 400, "companyId and employeeId query params are required");
    }

    const tools = toolRegistry.getAllToolDefinitions();

    // Same no-?lang=-means-unchanged-behavior rule as the public card route:
    // only an explicit choice engages multilingual resolution; absent, this
    // falls back to whatever the agent's greeting is already tagged as.
    const langParam = req.nextUrl.searchParams.get("lang");

    // Vapi speaks this verbatim before the model runs, so a company's
    // scripted opening (e.g. a specific pitch) has to come from the
    // agent record, not the system prompt — see first_message on ai_agents.
    // The employee/company are fetched alongside it purely for their voice
    // override and greeting template variables, so a phone call and a
    // browser call sound like the same person.
    const [agent, employee, company, settings] = await Promise.all([
      agentRepo.getAgentByEmployee(employeeId).catch(() => null),
      knowledgeRepo.getEmployeeById(employeeId).catch(() => null),
      knowledgeRepo.getCompanyById(companyId).catch(() => null),
      // The company's default voice from Settings, the last step before the
      // platform default. Degrades to null so a settings outage cannot fail
      // the call — it just falls through to the platform voice.
      settingsRepo.getSettings(companyId).catch(() => null),
    ]);

    const companyLanguageSettings = resolveCompanyLanguageSettings(settings?.language_settings as Record<string, unknown> | undefined);
    const language = clampToEnabledLanguages(
      langParam
        ? resolveRequestLanguage(langParam)
        : isSupportedLanguage(agent?.welcome_message_language)
          ? agent!.welcome_message_language!
          : companyLanguageSettings.defaultLanguage ?? DEFAULT_LANGUAGE,
      companyLanguageSettings
    );
    const transcriberConfig = resolveTranscriberConfig(language);

    const systemPromptBase = await promptAssemblyService.assembleSystemPrompt(companyId, employeeId);
    const systemPrompt = langParam ? systemPromptBase + getLanguageDirective(language) : systemPromptBase;

    if (message.call?.id) {
      await conversationRepo.getOrCreateConversationByVapiCallId(companyId, employeeId, message.call.id, langParam ? language : undefined);
    }

    const firstMessage =
      langParam && employee && company
        ? resolveGreeting(agent, company, employee, language)
        : agent?.first_message?.trim() || "Hello! Thank you for scanning my business card. How can I help you today?";
    const voiceConfig = resolveVoiceProviderConfig(
      employee?.voice_id,
      agent?.voice_model_id,
      (settings?.voice_settings as Record<string, unknown> | undefined)?.default_voice_model as string | undefined,
      // Same custom-voice context as the browser call path (public card
      // route) so a phone call and a browser call can never end up on
      // different TTS providers.
      { language, companyId, employeeId, baseUrl: resolvePublicBaseUrl(req.nextUrl.origin) }
    );

    return NextResponse.json({
      assistant: {
        firstMessage,
        // See useVapiSession.ts (the browser call path) — kept identical here
        // so a phone call reacts to a caller talking over the greeting the
        // same way a browser call does: the scripted opening plays to
        // completion, uninterrupted, like a receptionist's fixed
        // announcement.
        firstMessageInterruptionsEnabled: false,
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }],
          tools,
        },
        // See resolveVoiceProviderConfig in shared/lib/voice.ts — no
        // output-volume control exists anywhere in the stack (verified
        // against the SDK's own types), so the real lever is provider/model
        // choice. Kept identical to the browser call path so a phone call
        // and a browser call never sound different from each other.
        voice:
          voiceConfig.provider === "custom-voice" && voiceConfig.serverUrl
            ? {
                provider: "custom-voice" as const,
                server: { url: voiceConfig.serverUrl, timeoutSeconds: 45 },
                // If our endpoint fails/times out, Vapi degrades to its own
                // built-in OpenAI voice (known-poor Tamil, but the call
                // keeps speaking) rather than going silent.
                fallbackPlan: { voices: [{ provider: "openai", voiceId: "nova", model: "tts-1" }] },
              }
            : voiceConfig.provider === "azure"
              ? { provider: "azure" as const, voiceId: voiceConfig.voiceId }
              : voiceConfig.provider === "11labs"
                ? { provider: "11labs" as const, voiceId: voiceConfig.voiceId, model: voiceConfig.model as "eleven_multilingual_v2" }
                : { provider: "openai" as const, voiceId: voiceConfig.voiceId, model: "tts-1-hd" as const },
        // Same transcriber resolution as the browser call path — Deepgram
        // for en/ta/hi/kn, Azure (env-gated on confirmed setup) for te/ml,
        // omitted entirely for a language with no confirmed-working
        // transcriber right now. See resolveTranscriberConfig.
        ...(langParam && transcriberConfig ? { transcriber: { provider: transcriberConfig.provider, language: transcriberConfig.language } as const } : {}),
      },
    });
  }

  // 2. Handle Function / Tool Calls
  if (message.type === "tool-calls") {
    const toolCall = message.toolCalls?.[0];
    if (!toolCall) {
      return formatApiResponse(null, 400, "No tool call provided");
    }

    // Vapi is authenticated (verifyWebhookToken/validateVapiWebhookSignature
    // above), but a valid signature only proves the request came from a call
    // we provisioned — it says nothing about the shape of what it sent. This
    // is the one field in the payload this route destructures without any
    // optional chaining; a malformed toolCall.function (an API change on
    // Vapi's side, a transport bug) previously threw straight through to the
    // outer catch as an opaque 500 instead of a controlled 400.
    const toolCallShape = z
      .object({ function: z.object({ name: z.string().min(1), arguments: z.record(z.unknown()) }) })
      .safeParse(toolCall);
    if (!toolCallShape.success) {
      return formatApiResponse(null, 400, "Malformed tool call payload");
    }

    const { name, arguments: args } = toolCallShape.data.function;
    const tool = toolRegistry.getTool(name);

    if (!tool) {
      return formatApiResponse(null, 404, `Tool '${name}' not found`);
    }

    const companyId = req.nextUrl.searchParams.get("companyId") || "";
    const employeeId = req.nextUrl.searchParams.get("employeeId") || "";
    const vapiCallId = message.call?.id;

    // `conversations.id` is a UUID FK that leads.conversation_id
    // references — passing the raw Vapi call ID string here (as this
    // route previously did) would fail that foreign key constraint the
    // first time a real call tried to save a lead.
    let conversationId: string | undefined;
    // Resolved once outside the `if` below so it's available to the tool
    // call regardless of whether a conversation row was created/found this
    // request — book_appointment's confirmation email (see ToolRegistry)
    // needs it to match the visitor's own conversation language, the same
    // ?lang= param already used above to pick the transcriber/voice/prompt.
    const lang = req.nextUrl.searchParams.get("lang");
    const language = lang ? resolveRequestLanguage(lang) : undefined;
    if (vapiCallId && companyId && employeeId) {
      const conversation = await conversationRepo.getOrCreateConversationByVapiCallId(
        companyId,
        employeeId,
        vapiCallId,
        language
      );
      await conversationRepo.appendToolCalled(conversation.id, name);
      conversationId = conversation.id;
    }

    const result = await tool.execute(args, { companyId, employeeId, conversationId, language });

    return NextResponse.json({
      results: [{ toolCallId: toolCall.id, result: JSON.stringify(result) }],
    });
  }

  // 3. Handle End of Call Report
  if (message.type === "end-of-call-report") {
    const companyId = req.nextUrl.searchParams.get("companyId") || message.call?.customer?.extension;
    const employeeId = req.nextUrl.searchParams.get("employeeId");
    const vapiCallId = message.call?.id;

    if (!companyId || !employeeId || !vapiCallId) {
      Logger.info("Vapi end-of-call-report missing correlation IDs, cannot persist", { vapiCallId });
      return formatApiResponse({ status: "processed" }, 200, "Call report acknowledged (no company/employee/call id to correlate)");
    }

    const endLang = req.nextUrl.searchParams.get("lang");
    const conversation = await conversationRepo.getOrCreateConversationByVapiCallId(
      companyId,
      employeeId,
      vapiCallId,
      endLang ? resolveRequestLanguage(endLang) : undefined
    );

    const durationSeconds = Number(message.durationSeconds ?? message.duration ?? 0);
    const summary = message.summary ?? message.analysis?.summary;
    const transcript = message.transcript ?? message.artifact?.transcript;
    const sentiment = message.analysis?.successEvaluation ?? message.analysis?.sentiment;
    const recordingUrl = message.recordingUrl ?? message.artifact?.recordingUrl;

    let audioMetadata: Record<string, unknown> = { endedReason: message.endedReason };
    if (recordingUrl) {
      const archivedPath = await archiveRecording(companyId, conversation.id, recordingUrl);
      audioMetadata = { ...audioMetadata, originalRecordingUrl: recordingUrl, archivedPath };
    }

    // name/email/phone are read ONLY to enrich the owner's conversation
    // summary below — they exist only if the visitor volunteered them to
    // save_lead during the call. Never returned to any public client.
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, score, name, email, phone")
      .eq("conversation_id", conversation.id)
      .maybeSingle();

    let appointmentId: string | undefined;
    if (lead) {
      const { data: appointment } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      appointmentId = appointment?.id;
    }

    // Deterministic intent from what the visitor actually said + which
    // tools fired — fills the conversations.intent column (previously
    // never written) and doubles as the summary notification's intent.
    const intent = deriveConversationIntent(extractVisitorLines(transcript), conversation.tools_called, Boolean(appointmentId));

    await conversationRepo.endConversation(conversation.id, {
      durationSeconds,
      summary,
      sentiment,
      transcript,
      intent,
      leadScore: lead?.score,
      appointmentId,
      audioMetadata,
    });

    Logger.info("VOICE_CALL_COMPLETED", { callId: vapiCallId, conversationId: conversation.id, durationSeconds, intent });

    // Owner's conversation-summary WhatsApp (see ConversationSummaryNotifier
    // for the idempotency/rate-limit/privacy contract). Awaited — this
    // handler already tolerates long work (maxDuration 60) and a
    // fire-and-forget promise can be dropped when the serverless instance
    // freezes right after the response. Failure is logged inside and never
    // thrown, so the call report itself always succeeds.
    const owner = await knowledgeRepo.getEmployeeById(employeeId).catch(() => null);
    const notifyResult = await sendConversationSummaryToOwner(
      { notifier: getWhatsAppNotifier(), idempotency: new SupabaseWhatsAppIdempotencyStore() },
      {
        conversationId: conversation.id,
        employeeId,
        ownerPhone: owner?.phone,
        startedAt: conversation.started_at,
        language: conversation.language,
        durationSeconds,
        transcript,
        vapiSummary: summary,
        toolsCalled: conversation.tools_called,
        appointmentLinked: Boolean(appointmentId),
        lead: lead ? { name: lead.name, email: lead.email, phone: lead.phone } : null,
      }
    );

    // The outcome is stamped onto the conversation row itself — runtime
    // logs on serverless are short-lived and often unreachable, so the
    // durable record of "did the owner get a summary, and if not why"
    // lives with the conversation. Best-effort: a stamp failure must not
    // fail the already-processed report.
    try {
      await supabaseAdmin
        .from("conversations")
        .update({
          audio_metadata: {
            ...audioMetadata,
            summaryNotification: { sent: notifyResult.sent, reason: notifyResult.reason ?? null, at: new Date().toISOString() },
          },
        })
        .eq("id", conversation.id);
    } catch {
      // Logged by the notifier itself; the stamp is purely diagnostic.
    }

    return formatApiResponse({ status: "processed" }, 200, "Call report processed and persisted");
  }

  return formatApiResponse({ status: "ignored" }, 200, "Event type acknowledged but not processed");
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let messageType = "unknown";

  try {
    const response = await withSpan("vapi_webhook", { job: "vapi_webhook" }, async (span) => {
      // Two accepted credentials, either of which proves the request came
      // from a call we provisioned:
      //
      //  1. A matching x-vapi-secret — used when the assistant's server config
      //     is set up in Vapi's dashboard with our secret.
      //  2. A signed token in the callback URL — required for browser-started
      //     calls, where the inline assistant config overrides the dashboard's
      //     server settings and Vapi consequently sends an EMPTY
      //     x-vapi-secret. Confirmed in production: header present,
      //     zero-length. The secret itself is never shipped to the browser;
      //     only this scoped, expiring HMAC over companyId+employeeId is.
      const tokenValid = verifyWebhookToken(
        req.nextUrl.searchParams.get("token"),
        req.nextUrl.searchParams.get("companyId") || "",
        req.nextUrl.searchParams.get("employeeId") || ""
      );

      if (!tokenValid && !validateVapiWebhookSignature(req)) {
        // A rejected webhook is otherwise invisible: Vapi retries quietly, no
        // conversation is ever written, and the only symptom is missing data
        // with no explanation. Record which credential was attempted — names
        // and presence only, never values.
        Logger.warn("Vapi webhook rejected: no valid credential", {
          hasToken: Boolean(req.nextUrl.searchParams.get("token")),
          xVapiSecretLength: (req.headers.get("x-vapi-secret") || "").length,
          secretConfigured: !isPlaceholderCredential(process.env.VAPI_WEBHOOK_SECRET),
        });
        return formatApiResponse(null, 401, "Unauthorized: Invalid webhook credential", ["Invalid signature"]);
      }

      const payload = await req.json();
      const message: VapiMessage | undefined = payload?.message;

      if (!message) {
        return formatApiResponse(null, 400, "Missing message object in payload");
      }

      messageType = message.type ?? "unknown";
      span.setAttribute("vapi.message_type", messageType);

      return handleVapiMessage(req, message);
    });

    voiceCallsTotal.add(1, { event_type: messageType, status: String(response.status) });
    return response;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown server error";
    Logger.error("Vapi Webhook Error", { error: errorMessage });
    voiceCallsTotal.add(1, { event_type: messageType, status: "500" });
    return formatApiResponse(null, 500, "Internal Server Error", [errorMessage]);
  } finally {
    httpRequestDuration.record((Date.now() - startTime) / 1000, { job: "vapi_webhook", message_type: messageType });
  }
}
