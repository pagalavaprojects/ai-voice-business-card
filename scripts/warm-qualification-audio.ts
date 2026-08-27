/**
 * Pre-renders every fixed qualification utterance and stores it in the same
 * durable cache the live TTS endpoint reads.
 *
 * Why this exists: the six questions, the closing prompt and the reprompt are
 * identical on every call, and generating them while somebody is waiting is
 * the difference between a conversation and dead air — a cold Gemini render
 * takes seconds. Rendering them once, in advance, turns each one into a
 * storage read.
 *
 * It writes through ttsCachePath(), the same function the endpoint looks up
 * with, so a warmed asset is found by identity rather than by convention.
 * Re-running is cheap and safe: anything already stored is skipped, and
 * changing a question's wording changes its key, so the stale recording is
 * simply never read again.
 *
 * Usage:
 *   npm run warm:qualification-audio
 *   npm run warm:qualification-audio -- --force      (re-render everything)
 *   npm run warm:qualification-audio -- --rate 16000 (an extra sample rate)
 */
import { createClient } from "@supabase/supabase-js";
import { allQualificationUtterances } from "../src/features/voice/lib/qualificationAudio";
import {
  isProviderConfigured,
  renderGeminiPcm,
  resamplePcm16,
  ttsCachePath,
} from "../src/shared/lib/tts/ttsBackends";

/** Vapi asks for 24 kHz on the web calls this card places; extra rates can be
 * warmed with --rate for a different transport. */
const DEFAULT_SAMPLE_RATES = [24000];
const BUCKET = "voice-assets";
const RENDER_TIMEOUT_MS = 60_000;
/** Gemini rate-limits this preview model hard: rendering the set back to back
 * gets five through and then 429s the rest. Warming is a background job, so
 * it can simply go slowly and retry rather than give up. */
const GAP_BETWEEN_RENDERS_MS = 6_000;
const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function renderWithRetry(text: string, label: string) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const audio = await renderGeminiPcm(text, RENDER_TIMEOUT_MS);
    if (audio) return audio;
    if (attempt === MAX_ATTEMPTS) return null;
    const backoff = GAP_BETWEEN_RENDERS_MS * 2 ** attempt;
    console.log(`         ${label} attempt ${attempt} produced nothing (likely rate limited) — waiting ${backoff / 1000}s`);
    await sleep(backoff);
  }
  return null;
}

function parseRates(argv: string[]): number[] {
  const rates = new Set(DEFAULT_SAMPLE_RATES);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--rate" && argv[i + 1]) {
      const rate = Number(argv[i + 1]);
      if (Number.isFinite(rate) && rate > 0) rates.add(rate);
    }
  }
  return [...rates];
}

async function main() {
  const force = process.argv.includes("--force");
  const sampleRates = parseRates(process.argv);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Supabase credentials are missing; cannot reach the audio cache.");
    process.exit(1);
  }
  // Gemini renders both languages: it is the one provider proven to speak
  // natural Tamil, and English moved onto it too so a single working
  // provider stands behind the whole qualification flow.
  if (!isProviderConfigured("gemini")) {
    console.error("GEMINI_API_KEY is not configured; nothing can be rendered.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const utterances = allQualificationUtterances();

  let rendered = 0;
  let skipped = 0;
  let failed = 0;

  for (const rate of sampleRates) {
    for (const utterance of utterances) {
      const assetPath = ttsCachePath("gemini", utterance.language, rate, utterance.text);
      const label = `${utterance.language}/${utterance.id}@${rate}`;

      if (!force) {
        const { data } = await supabase.storage.from(BUCKET).download(assetPath);
        if (data) {
          console.log(`skip     ${label} (already cached)`);
          skipped += 1;
          continue;
        }
      }

      const audio = await renderWithRetry(utterance.text, label);
      if (!audio) {
        console.error(`FAILED   ${label} — provider returned no audio`);
        failed += 1;
        continue;
      }

      const pcm = resamplePcm16(audio.pcm, audio.sampleRate, rate);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(assetPath, pcm, { contentType: "application/octet-stream", upsert: true });
      if (error) {
        console.error(`FAILED   ${label} — ${error.message}`);
        failed += 1;
        continue;
      }

      const seconds = (pcm.byteLength / (rate * 2)).toFixed(1);
      console.log(`rendered ${label} (${pcm.byteLength} bytes, ${seconds}s)`);
      rendered += 1;
      await sleep(GAP_BETWEEN_RENDERS_MS);
    }
  }

  console.log(`\nrendered ${rendered}, already cached ${skipped}, failed ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("warm-qualification-audio failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
