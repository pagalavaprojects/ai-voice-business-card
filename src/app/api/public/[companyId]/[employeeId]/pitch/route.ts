import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";
import { Logger } from "@/shared/lib/logger";
import { isEmployeeCardVisible } from "@/shared/lib/employeeVisibility";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";
import { resolveRequestLanguage, resolveGreeting } from "@/features/language/server";
import { agentRepo } from "@/core/infrastructure/bootstrap/assistantRuntime";
import { composePitchScript, isPitchType, PitchSourceData, getSmartAiLeadBusinessCardScript, SMART_AI_LEAD_BUSINESS_CARD_TYPE } from "@/features/voice/lib/pitchScripts";
import { GEMINI_TTS_MODEL, GEMINI_TTS_VOICE, isConfiguredKey, pcmToWav, renderGeminiPcm } from "@/shared/lib/tts/ttsBackends";

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
  // "intro" (2026-08-19) is the card's recorded introduction — served
  // through this route so it inherits the entire persist-then-serve cache
  // stack, the Gemini/OpenAI/browser-TTS fallback chain, and the ETag
  // handling. It is deliberately NOT added to PitchType/PITCH_TYPES: its
  // script is the card's greeting (resolveGreeting — identical content to
  // what the phone path speaks), not a composed pitch, and the LISTEN grid
  // must not grow a fourth button.
  const isIntro = type === "intro";
  // "smart_ai_lead_business_card" (2026-09-01) is a fixed, approved recorded
  // item — like the intro, it rides the whole persist-then-serve cache +
  // Gemini/OpenAI/browser-TTS fallback stack, but is deliberately NOT a
  // PitchType (its script is a fixed constant, not a composed pitch). It has
  // its OWN English and Tamil scripts: an English request renders the English
  // script through the English (OpenAI) voice, a Tamil (or any non-English)
  // request renders the Tamil script through Gemini — separate cache identities
  // (contentLanguage below) that can never cross-contaminate.
  const isSmartCard = type === SMART_AI_LEAD_BUSINESS_CARD_TYPE;
  if (!isIntro && !isSmartCard && !isPitchType(type)) {
    return NextResponse.json({ message: "Unknown pitch type" }, { status: 400 });
  }
  const language = resolveRequestLanguage(req.nextUrl.searchParams.get("lang"));
  const smartCard = isSmartCard ? getSmartAiLeadBusinessCardScript(language) : null;
  // The language the audio is actually IN — drives the cache key, ETag and
  // provider routing. For the smart card it is the resolved en/ta; otherwise
  // the requested language unchanged.
  const contentLanguage = smartCard ? smartCard.language : language;
  const wantsScript = req.nextUrl.searchParams.get("format") === "script";

  if (!(await enforcePitchRateLimit(req))) {
    return NextResponse.json({ message: "Too many requests — please try again shortly." }, { status: 429 });
  }

  try {
    // One batch (2026-08-19 audit): services/products key only off the
    // URL's companyId, so awaiting them behind the identity pair cost a
    // serial DB round trip per uncached render. 404 still checked first.
    // The agent row rides along only for the intro type — its greeting
    // fields are the introduction's script source.
    const [company, employee, services, products, agent] = await Promise.all([
      knowledgeRepo.getCompanyById(companyId),
      knowledgeRepo.getEmployeeById(employeeId),
      knowledgeRepo.getServicesByCompany(companyId).catch(() => []),
      knowledgeRepo.getProductsByCompany(companyId).catch(() => []),
      isIntro ? agentRepo.getAgentByEmployee(employeeId).catch(() => null) : Promise.resolve(null),
    ]);
    if (!company || !employee || employee.company_id !== companyId || !isEmployeeCardVisible(employee)) {
      return NextResponse.json({ message: "Business card not found" }, { status: 404 });
    }

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
    // The introduction speaks EXACTLY what the phone path's greeting
    // speaks — resolveGreeting is the single source of that content (the
    // approved MAYLAANAI_INTRODUCTION for the demo company's English, the
    // approved Tamil greeting for Tamil) — so the recorded intro and a
    // phone caller's opening can never drift apart.
    const script = isIntro
      ? resolveGreeting(agent, company, employee, language)
      : isSmartCard
        ? smartCard!.script
        : composePitchScript(type, language, source);

    if (wantsScript) {
      return NextResponse.json(
        { script, language: contentLanguage },
        // Shorter than the audio cache: the script is cheap to recompose
        // and is only fetched on the fallback path.
        { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } }
      );
    }

    const scriptHash = createHash("sha1").update(script).digest("hex").slice(0, 8);
    // The FULL cache identity: company/employee/type/language/script hash
    // AND provider/model/voice — a Gemini WAV and an OpenAI MP3 of the same
    // script are different recordings, and so are two renders after a model
    // or voice upgrade; none may ever be served for another. (Renamed from
    // the pre-2026-08-19 keys that carried only the provider implicitly —
    // old objects simply age out unused; EN had nothing stored, TA is
    // re-warmed post-deploy.)
    const mp3Path = `pitch/${companyId}/${employeeId}/${type}.${contentLanguage}.${scriptHash}.openai.tts-1-hd.nova.mp3`;
    const geminiPath = `pitch/${companyId}/${employeeId}/${type}.${contentLanguage}.${scriptHash}.gemini.${GEMINI_TTS_MODEL}.${GEMINI_TTS_VOICE}.wav`;
    const useGemini = contentLanguage === "ta" && isConfiguredKey(process.env.GEMINI_API_KEY);

    // Content identity for conditional requests: the URL never changes when
    // content does (the hash lives in the storage key), so the ETag is what
    // lets a returning browser revalidate its cached multi-megabyte WAV
    // with an empty 304 instead of re-downloading it after max-age expires.
    const etag = `"${type}-${contentLanguage}-${scriptHash}-${useGemini ? "gemini" : "openai"}"`;
    if (req.headers.get("if-none-match") === etag) {
      return notModifiedResponse(etag);
    }

    // Layer 2: the durable copy. download() rather than a redirect to the
    // bucket's public URL keeps the response same-origin under this
    // route's own cache headers, and never leaks bucket topology.
    if (useGemini) {
      const storedWav = await downloadStoredPitch(geminiPath);
      if (storedWav) return audioResponse(storedWav, "audio/wav", etag);
    }
    // For Tamil (useGemini) a cached OpenAI MP3 must NEVER be served: OpenAI
    // voices read Tamil as English phonetics (gibberish), and one written
    // during a transient Gemini outage would otherwise shadow Gemini
    // permanently — geminiPath is checked above, so once an mp3 exists the
    // Gemini render below is never reached again. Skipping it for Tamil means
    // a Gemini miss always re-attempts Gemini (recovering natural audio once
    // the outage/quota clears).
    if (!useGemini) {
      const stored = await downloadStoredPitch(mp3Path);
      if (stored) return audioResponse(stored, "audio/mpeg", etag);
    }

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
        return audioResponse(wav, "audio/wav", etag);
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
    // NEVER persist an OpenAI MP3 for Tamil (useGemini): caching gibberish
    // Tamil is exactly what would shadow Gemini on every later request. A
    // Tamil visitor still hears this transient OpenAI render once, but it is
    // not stored, so the next request re-attempts Gemini.
    if (!useGemini) {
      try {
        await storage.ensureBucket("voice-assets", true);
        await storage.upload("voice-assets", mp3Path, audio, "audio/mpeg");
      } catch (err) {
        Logger.warn("Pitch audio persistence failed — serving unpersisted render", {
          assetPath: mp3Path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // For Tamil (useGemini) this OpenAI render is a TRANSIENT fallback for a
    // momentary Gemini failure, and OpenAI reads Tamil as English gibberish.
    // It must be neither durably/edge cached nor share the Gemini render's
    // ETag: otherwise the CDN would serve the gibberish for up to a day, and a
    // browser would 304-revalidate against the Gemini ETag and keep replaying
    // it even after Gemini recovers. Serve it private/no-store with a distinct
    // ETag so the next request re-attempts Gemini. (The storage-layer guard
    // above already prevents PERSISTING it; this closes the same shadowing at
    // the HTTP cache layer.)
    if (useGemini) {
      return audioResponse(audio, "audio/mpeg", `${etag}-openai-fallback`, "private, no-store, max-age=0");
    }
    return audioResponse(audio, "audio/mpeg", etag);
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

const AUDIO_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";

function audioResponse(
  audio: Buffer,
  contentType: "audio/mpeg" | "audio/wav",
  etag: string,
  cacheControl: string = AUDIO_CACHE_CONTROL
): NextResponse {
  return new NextResponse(new Uint8Array(audio), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(audio.byteLength),
      // The URL never changes for the same content (the hash lives in the
      // storage key, not the URL), so the edge copy is capped at a day —
      // long enough that repeat plays are CDN hits, short enough that a
      // company edit propagates within a day even at the edge. The ETag
      // lets browser caches revalidate for free past max-age.
      "Cache-Control": cacheControl,
      ETag: etag,
      "Accept-Ranges": "bytes",
    },
  });
}

function notModifiedResponse(etag: string): NextResponse {
  return new NextResponse(null, {
    status: 304,
    headers: { "Cache-Control": AUDIO_CACHE_CONTROL, ETag: etag },
  });
}
