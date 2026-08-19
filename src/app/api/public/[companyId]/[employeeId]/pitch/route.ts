import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";
import { Logger } from "@/shared/lib/logger";
import { isEmployeeCardVisible } from "@/shared/lib/employeeVisibility";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";
import { resolveRequestLanguage } from "@/features/language/server";
import { composePitchScript, isPitchType, PitchSourceData } from "@/features/voice/lib/pitchScripts";
import { isConfiguredKey, pcmToWav, renderGeminiPcm } from "@/shared/lib/tts/ttsBackends";

export const dynamic = "force-dynamic";
// First-ever render of a long pitch can take Gemini/OpenAI tens of seconds;
// after that the durable Supabase copy answers instantly.
export const maxDuration = 120;

const knowledgeRepo = new SupabaseKnowledgeRepository();
const storage = new SupabaseStorageAdapter();

/** Renders a script to WAV via Gemini TTS — the TAMIL audio provider
 * (proven natural Tamil in the 2026-08-18 proof-of-concept); OpenAI remains
 * the provider for every other language and the automatic fallback when
 * Gemini fails. The Gemini request itself lives in shared/lib/tts (also the
 * real-time custom-voice backend) — this wrapper only adds the WAV container
 * a browser <audio> element needs. Returns null on ANY failure so the caller
 * falls back to OpenAI; never throws. */
async function renderGeminiTts(script: string): Promise<Buffer | null> {
  const audio = await renderGeminiPcm(script);
  return audio ? pcmToWav(audio.pcm, audio.sampleRate) : null;
}

/**
 * Serves the card's PRE-RECORDED voice pitches (elevator ≈30s, product
 * ≈40s, USP ≈5s). Speak-only by design: no microphone, no transcription,
 * no conversational session — the browser just plays the returned MP3.
 *
 * Three layers, cheapest first — the recording is genuinely persistent,
 * not regenerated per click:
 *
 *   1. Vercel's CDN (s-maxage below) absorbs repeat plays edge-wide.
 *   2. Supabase Storage holds the rendered MP3 durably — serverless
 *      instances are recycled constantly, so process memory is NOT a
 *      cache layer this route may rely on (a warm-lambda memo would look
 *      fine in tests and quietly re-bill TTS in production).
 *   3. Only a genuinely never-rendered script reaches OpenAI TTS, and the
 *      result is stored before it is served, so each (content, language,
 *      type) renders at most once — ever, across all instances.
 *
 * The storage key embeds a hash of the composed script, so editing the
 * company's products/services naturally produces a new recording while
 * the stale object simply ages out unused.
 *
 * `?format=script` returns the composed script text instead of audio —
 * no OpenAI involved. The card uses it as a client-side speech-synthesis
 * fallback so the pitch still speaks even while TTS rendering is
 * impossible (e.g. the OpenAI account is out of credits).
 */
async function enforcePitchRateLimit(req: NextRequest): Promise<boolean> {
  const identifier = req.headers.get("x-forwarded-for") || "unknown";
  // TTS is the most expensive thing a public visitor can trigger, so this
  // is tighter than the card-read limiter (which allows 60/10min).
  const { allowed } = await checkRateLimitDistributed(`public-pitch:${identifier}`, 20, 10 * 60_000);
  return allowed;
}

export async function GET(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  const { companyId, employeeId } = params;

  const type = req.nextUrl.searchParams.get("type");
  if (!isPitchType(type)) {
    return NextResponse.json({ message: "Unknown pitch type" }, { status: 400 });
  }
  const language = resolveRequestLanguage(req.nextUrl.searchParams.get("lang"));
  const wantsScript = req.nextUrl.searchParams.get("format") === "script";

  if (!(await enforcePitchRateLimit(req))) {
    return NextResponse.json({ message: "Too many requests — please try again shortly." }, { status: 429 });
  }

  try {
    const [company, employee] = await Promise.all([
      knowledgeRepo.getCompanyById(companyId),
      knowledgeRepo.getEmployeeById(employeeId),
    ]);
    if (!company || !employee || employee.company_id !== companyId || !isEmployeeCardVisible(employee)) {
      return NextResponse.json({ message: "Business card not found" }, { status: 404 });
    }

    const [services, products] = await Promise.all([
      knowledgeRepo.getServicesByCompany(companyId).catch(() => []),
      knowledgeRepo.getProductsByCompany(companyId).catch(() => []),
    ]);

    const source: PitchSourceData = {
      companyId,
      companyName: company.name,
      employeeName: employee.name,
      designation: employee.designation,
      website: company.website,
      serviceNames: services.map((s) => s.name),
      services: services.map((s) => ({ name: s.name, description: s.description })),
      products: products.map((p) => ({ name: p.name, description: p.description })),
    };
    const script = composePitchScript(type, language, source);

    if (wantsScript) {
      return NextResponse.json(
        { script, language },
        // Shorter than the audio cache: the script is cheap to recompose
        // and is only fetched on the fallback path.
        { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } }
      );
    }

    const scriptHash = createHash("sha1").update(script).digest("hex").slice(0, 8);
    const mp3Path = `pitch/${companyId}/${employeeId}/${type}.${language}.${scriptHash}.mp3`;
    // Provider is part of the cache identity: a Gemini WAV and an OpenAI
    // MP3 of the same script are different recordings and must never be
    // served for each other.
    const geminiPath = `pitch/${companyId}/${employeeId}/${type}.${language}.${scriptHash}.gemini.wav`;
    const useGemini = language === "ta" && isConfiguredKey(process.env.GEMINI_API_KEY);

    // Layer 2: the durable copy. download() rather than a redirect to the
    // bucket's public URL keeps the response same-origin under this
    // route's own cache headers, and never leaks bucket topology.
    if (useGemini) {
      const storedWav = await downloadStoredPitch(geminiPath);
      if (storedWav) return audioResponse(storedWav, "audio/wav");
    }
    const stored = await downloadStoredPitch(mp3Path);
    if (stored) return audioResponse(stored, "audio/mpeg");

    // Layer 3a: Tamil renders through Gemini TTS (POC-proven natural
    // Tamil). Persist-then-serve, same as the OpenAI path below; ANY
    // Gemini failure falls through to OpenAI so Tamil can never end up
    // worse off than before Gemini existed.
    if (useGemini) {
      const wav = await renderGeminiTts(script);
      if (wav) {
        try {
          await storage.ensureBucket("voice-assets", true);
          await storage.upload("voice-assets", geminiPath, wav, "audio/wav");
        } catch (err) {
          Logger.warn("Gemini pitch audio persistence failed — serving unpersisted render", {
            assetPath: geminiPath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return audioResponse(wav, "audio/wav");
      }
    }

    // Layer 3b: render once via OpenAI, persist, then serve.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || /your-|placeholder|example/i.test(apiKey)) {
      return NextResponse.json({ message: "Voice pitch service not configured" }, { status: 503 });
    }

    // tts-1-hd + nova matches the voice the live AI conversation already
    // uses (see useVapiSession's OpenAI voice default), so the pre-recorded
    // pitches and the interactive assistant sound like the same "person".
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "tts-1-hd", voice: "nova", input: script, response_format: "mp3" }),
    });
    if (!ttsRes.ok) {
      const body = await ttsRes.text().catch(() => "");
      Logger.error("Pitch TTS generation failed", { status: ttsRes.status, body: body.slice(0, 300), type, language });
      return NextResponse.json({ message: "Voice pitch temporarily unavailable" }, { status: 503 });
    }
    const audio = Buffer.from(await ttsRes.arrayBuffer());

    // Persist before serving; a storage failure must not fail the play —
    // the visitor still gets their audio, the next render just pays again.
    try {
      await storage.ensureBucket("voice-assets", true);
      await storage.upload("voice-assets", mp3Path, audio, "audio/mpeg");
    } catch (err) {
      Logger.warn("Pitch audio persistence failed — serving unpersisted render", {
        assetPath: mp3Path,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return audioResponse(audio, "audio/mpeg");
  } catch (err) {
    Logger.warn("Pitch generation failed", { companyId, employeeId, type, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ message: "Voice pitch service unavailable" }, { status: 503 });
  }
}

async function downloadStoredPitch(assetPath: string): Promise<Buffer | null> {
  try {
    const { supabaseAdmin } = await import("@/shared/lib/supabase");
    const { data, error } = await supabaseAdmin.storage.from("voice-assets").download(assetPath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

function audioResponse(audio: Buffer, contentType: "audio/mpeg" | "audio/wav"): NextResponse {
  return new NextResponse(new Uint8Array(audio), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(audio.byteLength),
      // The URL never changes for the same content (the hash lives in the
      // storage key, not the URL), so the edge copy is capped at a day —
      // long enough that repeat plays are CDN hits, short enough that a
      // company edit propagates within a day even at the edge.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      "Accept-Ranges": "bytes",
    },
  });
}
