import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/shared/lib/logger";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";
import { verifyWebhookToken } from "@/shared/lib/webhookToken";
import { validateVapiWebhookSignature } from "@/shared/lib/security";
import {
  GEMINI_TTS_MODEL,
  GEMINI_TTS_VOICE,
  isConfiguredKey,
  isProviderConfigured,
  PcmAudio,
  renderCustomPcm,
  renderGeminiPcm,
  renderOpenAiPcm,
  resamplePcm16,
  resolveProviderChain,
  ttsCachePath,
  TtsProviderName,
} from "@/shared/lib/tts/ttsBackends";

export const dynamic = "force-dynamic";
// Vapi's voice.server.timeoutSeconds is set to 45 by our assistant config;
// this bound must comfortably exceed one generation + one fallback attempt.
export const maxDuration = 60;

/**
 * Vapi CUSTOM TTS endpoint (assistant.voice.provider = "custom-voice").
 *
 * Contract (docs.vapi.ai/customization/custom-voices/custom-tts): Vapi POSTs
 * `{ message: { type: "voice-request", text, sampleRate, ... } }` and the
 * response must be HTTP 200, `Content-Type: application/octet-stream`, raw
 * mono 16-bit little-endian PCM at EXACTLY the requested sampleRate — no WAV
 * header, no container.
 *
 * This route is a thin, secured LANGUAGE ROUTER over the shared PCM backends
 * (shared/lib/tts/ttsBackends): per language it walks an ordered provider
 * chain, serves from the durable cache when the exact utterance was rendered
 * before, and otherwise renders → persists → serves. It deliberately does NOT
 * touch the pitch route: pre-recorded pitch playback (Gemini WAV in a browser
 * <audio> tag) and real-time conversation PCM remain separate systems that
 * merely share backend request code.
 *
 * Auth mirrors /api/vapi/webhook exactly, for the same reason documented in
 * shared/lib/webhookToken.ts: browser-started calls carry inline assistant
 * config, so a dashboard secret can never authenticate them — the server
 * signs a scoped, expiring HMAC token into the URL instead. A dashboard-
 * provisioned call may alternatively present x-vapi-secret.
 *
 * Security posture (TTS is the most expensive compute a call can trigger):
 * auth required, strict text cap, per-tenant rate limit, per-request backend
 * timeout, and logs carry text hashes/lengths — never the text itself.
 */

const MAX_TEXT_CHARS = 1000;
const ALLOWED_SAMPLE_RATES = new Set([8000, 16000, 22050, 24000, 44100]);
const BACKEND_TIMEOUT_MS = 20_000;


async function readCachedPcm(assetPath: string): Promise<Buffer | null> {
  try {
    const { supabaseAdmin } = await import("@/shared/lib/supabase");
    const { data, error } = await supabaseAdmin.storage.from("voice-assets").download(assetPath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

async function persistPcm(assetPath: string, pcm: Buffer): Promise<void> {
  try {
    const { SupabaseStorageAdapter } = await import("@/core/infrastructure/storage/SupabaseStorageAdapter");
    const storage = new SupabaseStorageAdapter();
    await storage.ensureBucket("voice-assets", true);
    await storage.upload("voice-assets", assetPath, pcm, "application/octet-stream");
  } catch (err) {
    // Serving beats caching — the next render just pays again.
    Logger.warn("TTS cache persistence failed", { assetPath, error: err instanceof Error ? err.message : String(err) });
  }
}

async function renderViaProvider(
  provider: TtsProviderName,
  text: string,
  language: string,
  sampleRate: number
): Promise<PcmAudio | null> {
  // Every backend takes the timeout itself and ABORTS its request on
  // expiry (2026-08-19 audit) — the previous Promise.race here advanced
  // the fallback chain on time but left the losing request running,
  // consuming the serverless function's connection budget for nothing.
  switch (provider) {
    case "custom":
      return renderCustomPcm(text, language === "ta" ? "ta" : "en", sampleRate, BACKEND_TIMEOUT_MS);
    case "gemini":
      if (!isConfiguredKey(process.env.GEMINI_API_KEY)) return null;
      return renderGeminiPcm(text, BACKEND_TIMEOUT_MS);
    case "openai":
      return renderOpenAiPcm(text, "nova", BACKEND_TIMEOUT_MS);
  }
}

function pcmResponse(pcm: Buffer, cache: "hit" | "miss", provider: TtsProviderName): NextResponse {
  return new NextResponse(new Uint8Array(pcm), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(pcm.byteLength),
      "X-TTS-Provider": provider,
      "X-TTS-Cache": cache,
    },
  });
}

export async function POST(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const employeeId = req.nextUrl.searchParams.get("employeeId");

  const tokenOk = Boolean(
    companyId && employeeId && verifyWebhookToken(req.nextUrl.searchParams.get("token"), companyId, employeeId)
  );
  if (!tokenOk && !validateVapiWebhookSignature(req)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = await checkRateLimitDistributed(`tts-vapi:${companyId ?? "header-auth"}:${employeeId ?? ""}`, 120, 60_000);
  if (!allowed) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  let body: { message?: { type?: string; text?: unknown; sampleRate?: unknown } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const message = body?.message;
  if (message?.type !== "voice-request") {
    return NextResponse.json({ message: "Expected a voice-request message" }, { status: 400 });
  }
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!text) {
    return NextResponse.json({ message: "text is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ message: `text exceeds ${MAX_TEXT_CHARS} characters` }, { status: 400 });
  }
  const sampleRate = typeof message.sampleRate === "number" ? message.sampleRate : 24000;
  if (!ALLOWED_SAMPLE_RATES.has(sampleRate)) {
    return NextResponse.json({ message: "Unsupported sampleRate" }, { status: 400 });
  }

  // The card/webhook signed the language into the URL when the call was
  // provisioned — authoritative. A missing param (misconfigured manual
  // setup) falls back to script detection so Tamil text can never be
  // pronounced through an English-routed chain.
  const langParam = req.nextUrl.searchParams.get("lang");
  const language = langParam || (/[஀-௿]/.test(text) ? "ta" : "en");

  const textHash = createHash("sha256").update(text).digest("hex").slice(0, 12);
    // Providers that cannot possibly answer are dropped BEFORE the loop: each
  // one otherwise costs a durable-cache read per utterance just to fail.
  const chain = resolveProviderChain(language).filter(isProviderConfigured);
  if (chain.length === 0) {
    Logger.error("TTS: no provider is configured", { language, textHash });
    return NextResponse.json({ message: "TTS unavailable" }, { status: 502 });
  }

  for (const provider of chain) {
    const assetPath = ttsCachePath(provider, language, sampleRate, text);
    const cached = await readCachedPcm(assetPath);
    if (cached) {
      Logger.info("TTS cache hit", { provider, language, sampleRate, textHash, chars: text.length });
      return pcmResponse(cached, "hit", provider);
    }
    const audio = await renderViaProvider(provider, text, language, sampleRate);
    if (audio) {
      const pcm = resamplePcm16(audio.pcm, audio.sampleRate, sampleRate);
      await persistPcm(assetPath, pcm);
      Logger.info("TTS rendered", { provider, language, sampleRate, textHash, chars: text.length, bytes: pcm.byteLength });
      return pcmResponse(pcm, "miss", provider);
    }
    Logger.warn("TTS provider failed — advancing fallback chain", { provider, language, textHash });
  }

  // Every provider failed. A non-200 here triggers Vapi's own
  // voice.fallbackPlan (configured to a built-in provider), so the call
  // still speaks — through Vapi's fallback voice — rather than dying.
  Logger.error("TTS: every provider in the chain failed", { language, textHash, chain: chain.join(",") });
  return NextResponse.json({ message: "TTS unavailable" }, { status: 502 });
}
