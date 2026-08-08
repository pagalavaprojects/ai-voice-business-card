import { NextRequest, NextResponse } from "next/server";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { Logger } from "@/shared/lib/logger";
import { isEmployeeCardVisible } from "@/shared/lib/employeeVisibility";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";
import { resolveRequestLanguage } from "@/features/language/server";
import { composePitchScript, isPitchType, PitchSourceData } from "@/features/voice/lib/pitchScripts";

export const dynamic = "force-dynamic";

const knowledgeRepo = new SupabaseKnowledgeRepository();

/**
 * Serves the card's PRE-RECORDED voice pitches (elevator ≈30s, product
 * ≈40s, USP ≈5s) as playable audio. Speak-only by design: no microphone,
 * no transcription, no conversational session — the browser just plays
 * the returned MP3. The script is composed deterministically from the
 * company's own data (see composePitchScript) and rendered through
 * OpenAI's TTS server-side, so the OPENAI_API_KEY never leaves the
 * server.
 *
 * Audio generation costs real money per call, so results are cached hard:
 * an in-process memo for warm lambdas plus long CDN cache headers —
 * the same (company, employee, type, lang) tuple produces the same audio
 * for a day. A content change (renamed product etc.) simply ages out.
 */
const audioMemo = new Map<string, { audio: ArrayBuffer; at: number }>();
const MEMO_TTL_MS = 24 * 60 * 60 * 1000;
const MEMO_MAX_ENTRIES = 200;

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

  if (!(await enforcePitchRateLimit(req))) {
    return NextResponse.json({ message: "Too many requests — please try again shortly." }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || /your-|placeholder|example/i.test(apiKey)) {
    return NextResponse.json({ message: "Voice pitch service not configured" }, { status: 503 });
  }

  try {
    const [company, employee] = await Promise.all([
      knowledgeRepo.getCompanyById(companyId),
      knowledgeRepo.getEmployeeById(employeeId),
    ]);
    if (!company || !employee || employee.company_id !== companyId || !isEmployeeCardVisible(employee)) {
      return NextResponse.json({ message: "Business card not found" }, { status: 404 });
    }

    const memoKey = `${companyId}:${employeeId}:${type}:${language}`;
    const hit = audioMemo.get(memoKey);
    if (hit && Date.now() - hit.at < MEMO_TTL_MS) {
      return audioResponse(hit.audio);
    }

    const [services, products] = await Promise.all([
      knowledgeRepo.getServicesByCompany(companyId).catch(() => []),
      knowledgeRepo.getProductsByCompany(companyId).catch(() => []),
    ]);

    const source: PitchSourceData = {
      companyName: company.name,
      employeeName: employee.name,
      designation: employee.designation,
      website: company.website,
      serviceNames: services.map((s) => s.name),
      services: services.map((s) => ({ name: s.name, description: s.description })),
      products: products.map((p) => ({ name: p.name, description: p.description })),
    };
    const script = composePitchScript(type, language, source);

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
    const audio = await ttsRes.arrayBuffer();

    if (audioMemo.size >= MEMO_MAX_ENTRIES) {
      const oldest = audioMemo.keys().next().value;
      if (oldest) audioMemo.delete(oldest);
    }
    audioMemo.set(memoKey, { audio, at: Date.now() });

    return audioResponse(audio);
  } catch (err) {
    Logger.warn("Pitch generation failed", { companyId, employeeId, type, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ message: "Voice pitch service unavailable" }, { status: 503 });
  }
}

function audioResponse(audio: ArrayBuffer): NextResponse {
  return new NextResponse(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      // s-maxage lets Vercel's CDN absorb repeat plays platform-wide;
      // stale-while-revalidate keeps playback instant while a fresh copy
      // regenerates after content edits age the cache out.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
