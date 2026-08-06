import { NextRequest, NextResponse } from "next/server";
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

    const systemPrompt = await promptAssemblyService.assembleSystemPrompt(companyId, employeeId);
    const tools = toolRegistry.getAllToolDefinitions();

    if (message.call?.id) {
      await conversationRepo.getOrCreateConversationByVapiCallId(companyId, employeeId, message.call.id);
    }

    // Vapi speaks this verbatim before the model runs, so a company's
    // scripted opening (e.g. a specific pitch) has to come from the
    // agent record, not the system prompt — see first_message on ai_agents.
    // The employee is fetched alongside it purely for their voice override, so
    // a phone call and a browser call sound like the same person.
    const [agent, employee, settings] = await Promise.all([
      agentRepo.getAgentByEmployee(employeeId).catch(() => null),
      knowledgeRepo.getEmployeeById(employeeId).catch(() => null),
      // The company's default voice from Settings, the last step before the
      // platform default. Degrades to null so a settings outage cannot fail
      // the call — it just falls through to the platform voice.
      settingsRepo.getSettings(companyId).catch(() => null),
    ]);
    const firstMessage = agent?.first_message?.trim() || "Hello! Thank you for scanning my business card. How can I help you today?";
    const voiceConfig = resolveVoiceProviderConfig(
      employee?.voice_id,
      agent?.voice_model_id,
      (settings?.voice_settings as Record<string, unknown> | undefined)?.default_voice_model as string | undefined
    );

    return NextResponse.json({
      assistant: {
        firstMessage,
        // See useVapiSession.ts (the browser call path) — kept identical here
        // so a phone call reacts to a caller talking over the greeting the
        // same way a browser call does.
        firstMessageInterruptionsEnabled: true,
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
          voiceConfig.provider === "11labs"
            ? { provider: "11labs" as const, voiceId: voiceConfig.voiceId, model: voiceConfig.model as "eleven_multilingual_v2" }
            : { provider: "openai" as const, voiceId: voiceConfig.voiceId, model: "tts-1-hd" as const },
      },
    });
  }

  // 2. Handle Function / Tool Calls
  if (message.type === "tool-calls") {
    const toolCall = message.toolCalls?.[0];
    if (!toolCall) {
      return formatApiResponse(null, 400, "No tool call provided");
    }

    const { name, arguments: args } = toolCall.function;
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
    if (vapiCallId && companyId && employeeId) {
      const conversation = await conversationRepo.getOrCreateConversationByVapiCallId(companyId, employeeId, vapiCallId);
      await conversationRepo.appendToolCalled(conversation.id, name);
      conversationId = conversation.id;
    }

    const result = await tool.execute(args, { companyId, employeeId, conversationId });

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

    const conversation = await conversationRepo.getOrCreateConversationByVapiCallId(companyId, employeeId, vapiCallId);

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

    const { data: lead } = await supabaseAdmin.from("leads").select("id, score").eq("conversation_id", conversation.id).maybeSingle();

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

    await conversationRepo.endConversation(conversation.id, {
      durationSeconds,
      summary,
      sentiment,
      transcript,
      leadScore: lead?.score,
      appointmentId,
      audioMetadata,
    });

    Logger.info("Vapi call ended and persisted", { callId: vapiCallId, conversationId: conversation.id, summary });
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
