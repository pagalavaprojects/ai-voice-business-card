/**
 * Shared TTS backend layer (src/shared/lib/tts/ttsBackends.ts) — the PCM
 * plumbing under BOTH the pitch route's Gemini path and the real-time Vapi
 * custom-voice route. These are the guarantees the two routes rely on:
 * correct WAV container math, a resampler that preserves duration, and
 * backends that return null (never throw) on any failure so fallback chains
 * always advance.
 */
import {
  pcmToWav,
  resamplePcm16,
  renderGeminiPcm,
  renderOpenAiPcm,
  renderCustomPcm,
  isConfiguredKey,
  GEMINI_TTS_MODEL,
} from "@/shared/lib/tts/ttsBackends";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe("pcmToWav", () => {
  it("produces a valid 44-byte RIFF header for 16-bit mono at the given rate", () => {
    const pcm = Buffer.alloc(2400 * 2); // 0.1s at 24kHz
    const wav = pcmToWav(pcm, 24000);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000); // sample rate
    expect(wav.readUInt32LE(28)).toBe(48000); // byte rate = rate * 2
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt16LE(34)).toBe(16); // bit depth
    expect(wav.readUInt32LE(40)).toBe(pcm.length); // data length
  });
});

describe("resamplePcm16", () => {
  it("returns the buffer unchanged when rates match", () => {
    const pcm = Buffer.from([1, 0, 2, 0, 3, 0]);
    expect(resamplePcm16(pcm, 24000, 24000)).toBe(pcm);
  });

  it("preserves audio duration across a rate change (44100 → 24000)", () => {
    const seconds = 0.5;
    const src = Buffer.alloc(Math.floor(44100 * seconds) * 2);
    const out = resamplePcm16(src, 44100, 24000);
    const outSeconds = out.length / 2 / 24000;
    expect(Math.abs(outSeconds - seconds)).toBeLessThan(0.001);
  });

  it("interpolates rather than repeating samples when upsampling", () => {
    // Two samples 0 → 1000: the midpoint of a 2x upsample must sit between.
    const src = Buffer.alloc(4);
    src.writeInt16LE(0, 0);
    src.writeInt16LE(1000, 2);
    const out = resamplePcm16(src, 8000, 16000);
    expect(out.readInt16LE(2)).toBe(500);
  });
});

describe("isConfiguredKey", () => {
  it.each(["", "your-key-here", "placeholder", "example-key"])("rejects %p", (v) => {
    expect(isConfiguredKey(v || undefined)).toBe(false);
  });
  it("accepts a real-looking key", () => {
    expect(isConfiguredKey("AQ.someRealKeyValue")).toBe(true);
  });
});

describe("renderGeminiPcm", () => {
  it("returns PCM and the rate parsed from the mimeType", async () => {
    process.env.GEMINI_API_KEY = "real-gemini-key";
    const pcmBytes = Buffer.from([1, 2, 3, 4]);
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "audio/l16; rate=24000", data: pcmBytes.toString("base64") } }] } },
        ],
      }),
    })) as unknown as typeof fetch;

    const audio = await renderGeminiPcm("வணக்கம்");
    expect(audio).not.toBeNull();
    expect(audio!.sampleRate).toBe(24000);
    expect(Buffer.compare(audio!.pcm, pcmBytes)).toBe(0);
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain(GEMINI_TTS_MODEL);
  });

  it("returns null (not a throw) on an HTTP error", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 429, text: async () => "quota" })) as unknown as typeof fetch;
    await expect(renderGeminiPcm("hello")).resolves.toBeNull();
  });

  it("returns null when the response has no audio part", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ candidates: [] }) })) as unknown as typeof fetch;
    await expect(renderGeminiPcm("hello")).resolves.toBeNull();
  });

  it("returns null when fetch itself throws", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(renderGeminiPcm("hello")).resolves.toBeNull();
  });
});

describe("renderOpenAiPcm", () => {
  it("returns null without a configured key — no network call at all", async () => {
    process.env.OPENAI_API_KEY = "your-openai-key-placeholder";
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(renderOpenAiPcm("hello")).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("requests pcm format and reports 24000 Hz", async () => {
    process.env.OPENAI_API_KEY = "sk-real";
    const bytes = new Uint8Array([9, 9]).buffer;
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => bytes })) as unknown as typeof fetch;
    const audio = await renderOpenAiPcm("hello");
    expect(audio!.sampleRate).toBe(24000);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body.response_format).toBe("pcm");
    expect(body.model).toBe("tts-1");
  });

  it("returns null on an HTTP error", async () => {
    process.env.OPENAI_API_KEY = "sk-real";
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => "bad key" })) as unknown as typeof fetch;
    await expect(renderOpenAiPcm("hello")).resolves.toBeNull();
  });
});

describe("renderCustomPcm", () => {
  it("returns null when CUSTOM_TTS_URL/API_KEY are not configured — no call", async () => {
    delete process.env.CUSTOM_TTS_URL;
    delete process.env.CUSTOM_TTS_API_KEY;
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(renderCustomPcm("hello", "en", 24000)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("POSTs the tts-server contract with bearer auth and echoes the requested rate", async () => {
    process.env.CUSTOM_TTS_URL = "https://tts.internal.example";
    process.env.CUSTOM_TTS_API_KEY = "svc-key";
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => bytes })) as unknown as typeof fetch;

    const audio = await renderCustomPcm("வணக்கம்", "ta", 16000);
    expect(audio!.sampleRate).toBe(16000);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://tts.internal.example/tts");
    expect(init.headers.Authorization).toBe("Bearer svc-key");
    expect(JSON.parse(init.body)).toEqual({ text: "வணக்கம்", language: "ta", sample_rate: 16000 });
  });

  it("returns null on backend failure so the caller's fallback chain advances", async () => {
    process.env.CUSTOM_TTS_URL = "https://tts.internal.example";
    process.env.CUSTOM_TTS_API_KEY = "svc-key";
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(renderCustomPcm("x", "en", 24000)).resolves.toBeNull();
  });
});
