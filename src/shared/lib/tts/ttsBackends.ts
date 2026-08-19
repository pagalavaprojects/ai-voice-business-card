import { Logger } from "@/shared/lib/logger";

/**
 * Server-side TTS backends shared by the pre-recorded pitch route and the
 * real-time Vapi custom-voice route (/api/tts/vapi).
 *
 * Each backend produces RAW PCM (signed 16-bit little-endian, mono) plus its
 * native sample rate — the caller decides whether to wrap it in a WAV
 * container (pitch playback in a browser <audio> element) or resample and
 * stream it bare (Vapi custom voice). Keeping the backends PCM-shaped is what
 * lets the two routes share one implementation without coupling their
 * delivery formats.
 *
 * Every backend returns null on ANY failure and never throws — callers
 * always have a fallback chain and a null simply advances it.
 */

export interface PcmAudio {
  pcm: Buffer;
  sampleRate: number;
}

export type TtsProviderName = "custom" | "gemini" | "openai";

/** Ordered provider chain per language for the real-time route. Tamil
 * prefers the self-hosted Indic backend, then Gemini (the proven
 * natural-Tamil cloud provider), then OpenAI (kept last purely so the call
 * degrades to *some* audio rather than silence — its Tamil is known-poor).
 * Every other language: self-hosted, then OpenAI. TTS_TAMIL_PROVIDER /
 * TTS_EN_PROVIDER promote a specific provider to the front without editing
 * code. Lives here (not in the route file) because Next.js route modules
 * may only export handlers. */
export function resolveProviderChain(language: string): TtsProviderName[] {
  const chain: TtsProviderName[] = language === "ta" ? ["custom", "gemini", "openai"] : ["custom", "openai"];
  const preferred = (language === "ta" ? process.env.TTS_TAMIL_PROVIDER : process.env.TTS_EN_PROVIDER)?.trim().toLowerCase();
  if (preferred && (chain as string[]).includes(preferred)) {
    return [preferred as TtsProviderName, ...chain.filter((p) => p !== preferred)];
  }
  return chain;
}

/** Gemini TTS is the proven natural-Tamil provider (2026-08-18 POC). */
export const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
export const GEMINI_TTS_VOICE = "Kore";

export function isConfiguredKey(v: string | undefined): boolean {
  return Boolean(v && !/your-|placeholder|example/i.test(v));
}

/** Wraps raw 16-bit mono PCM in a WAV container a browser <audio> element
 * can play directly. */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Linear resampler for 16-bit mono PCM. Quality is adequate for speech
 * (the alternative — shipping a DSP dependency into a Vercel function for
 * a rate conversion Vapi may not even request — is not worth it: backends
 * already emit 24 kHz, Vapi's usual request rate). */
export function resamplePcm16(pcm: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return pcm;
  const srcLen = Math.floor(pcm.length / 2);
  const dstLen = Math.floor((srcLen * toRate) / fromRate);
  const out = Buffer.alloc(dstLen * 2);
  for (let i = 0; i < dstLen; i++) {
    const srcPos = (i * fromRate) / toRate;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, srcLen - 1);
    const frac = srcPos - i0;
    const s0 = pcm.readInt16LE(i0 * 2);
    const s1 = pcm.readInt16LE(i1 * 2);
    out.writeInt16LE(Math.round(s0 + (s1 - s0) * frac), i * 2);
  }
  return out;
}

/** Renders text via Gemini TTS to raw PCM. Extracted verbatim from the pitch
 * route's renderGeminiTts (which now wraps this in a WAV container) so the
 * real-time route reuses the identical request without duplicating it. */
export async function renderGeminiPcm(text: string): Promise<PcmAudio | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": process.env.GEMINI_API_KEY as string },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } } },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      Logger.warn("Gemini TTS generation failed", { status: res.status, body: body.slice(0, 200) });
      return null;
    }
    const payload = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
    };
    const inline = payload.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) {
      Logger.warn("Gemini TTS returned no audio part");
      return null;
    }
    const sampleRate = Number((/rate=(\d+)/.exec(inline.mimeType ?? "") ?? [])[1] ?? 24000);
    return { pcm: Buffer.from(inline.data, "base64"), sampleRate };
  } catch (err) {
    Logger.warn("Gemini TTS request threw", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Renders text via OpenAI TTS to raw PCM. OpenAI's `pcm` response format is
 * 24 kHz signed 16-bit little-endian mono — exactly the shape Vapi's custom
 * voice consumes. Uses tts-1 (not -hd): the realtime path values latency over
 * the marginal -hd quality difference, and this backend only serves as a
 * fallback when the primary is down. */
export async function renderOpenAiPcm(text: string, voiceId = "nova"): Promise<PcmAudio | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!isConfiguredKey(apiKey)) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "tts-1", voice: voiceId, input: text, response_format: "pcm" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      Logger.warn("OpenAI PCM TTS failed", { status: res.status, body: body.slice(0, 200) });
      return null;
    }
    return { pcm: Buffer.from(await res.arrayBuffer()), sampleRate: 24000 };
  } catch (err) {
    Logger.warn("OpenAI PCM TTS threw", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Renders text via the self-hosted TTS service (tts-server/server.py, or any
 * service honoring the same POST /tts contract). The service returns PCM at
 * exactly the requested rate, so no resampling is needed on this path. */
export async function renderCustomPcm(
  text: string,
  language: string,
  sampleRate: number,
  timeoutMs = 15_000
): Promise<PcmAudio | null> {
  const baseUrl = process.env.CUSTOM_TTS_URL?.trim();
  const apiKey = process.env.CUSTOM_TTS_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, language, sample_rate: sampleRate }),
      signal: controller.signal,
    });
    if (!res.ok) {
      Logger.warn("Custom TTS backend failed", { status: res.status, language });
      return null;
    }
    return { pcm: Buffer.from(await res.arrayBuffer()), sampleRate };
  } catch (err) {
    Logger.warn("Custom TTS backend threw", {
      language,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
