/**
 * Route-level tests for POST /api/tts/vapi — the Vapi custom-voice endpoint.
 *
 * Proves the endpoint's own contract obligations, not the backends'
 * (TtsBackends.test.ts covers those): Vapi-shaped auth (signed URL token OR
 * x-vapi-secret), voice-request validation, the per-language provider chain
 * with fallback, resampling to the REQUEST's sampleRate (Vapi requires the
 * response rate to match exactly), provider/language-scoped cache identity,
 * and honest failure (a non-200 that hands the call to Vapi's fallbackPlan
 * rather than returning silence-shaped garbage).
 */
const download = jest.fn();
const ensureBucket = jest.fn();
const upload = jest.fn();
const checkRateLimitDistributed = jest.fn();

jest.mock("@/core/infrastructure/storage/SupabaseStorageAdapter", () => ({
  SupabaseStorageAdapter: jest.fn().mockImplementation(() => ({
    ensureBucket: (...args: unknown[]) => ensureBucket(...args),
    upload: (...args: unknown[]) => upload(...args),
  })),
}));

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: { storage: { from: () => ({ download: (...args: unknown[]) => download(...args) }) } },
}));

jest.mock("@/shared/lib/rateLimit", () => ({
  checkRateLimitDistributed: (...args: unknown[]) => checkRateLimitDistributed(...args),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/tts/vapi/route";
import { resolveProviderChain } from "@/shared/lib/tts/ttsBackends";
import { createWebhookToken } from "@/shared/lib/webhookToken";

const COMPANY_ID = "company-1";
const EMPLOYEE_ID = "employee-1";
const TA_Q1 = "எங்கள் சேவை அல்லது தயாரிப்பு உங்களுக்கு உடனடியாகத் தேவைப்படுகிறதா?";

function voiceRequest(text: string, sampleRate: number | string = 24000): BodyInit {
  return JSON.stringify({ message: { type: "voice-request", text, sampleRate, timestamp: 1 } });
}

function req(qs: string, body: BodyInit): NextRequest {
  return new NextRequest(`http://localhost/api/tts/vapi?${qs}`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

function signedQs(lang = "ta"): string {
  const token = createWebhookToken(COMPANY_ID, EMPLOYEE_ID);
  return `companyId=${COMPANY_ID}&employeeId=${EMPLOYEE_ID}&lang=${lang}&token=${encodeURIComponent(token as string)}`;
}

/** 0.1s of 24kHz silence as a backend's raw PCM answer. */
const BACKEND_PCM = Buffer.alloc(2400 * 2);

describe("POST /api/tts/vapi", () => {
  const ORIGINAL_ENV = process.env;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      VAPI_WEBHOOK_SECRET: "wh9F8e7D6c5B4a32Secret10",
      CUSTOM_TTS_URL: "https://tts.internal.example",
      CUSTOM_TTS_API_KEY: "svc-key",
      GEMINI_API_KEY: "AQ.test-gemini-key",
      OPENAI_API_KEY: "sk-real-test-key",
    };
    checkRateLimitDistributed.mockResolvedValue({ allowed: true });
    download.mockResolvedValue({ data: null, error: { message: "not found" } });
    ensureBucket.mockResolvedValue(undefined);
    upload.mockResolvedValue(undefined);
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => BACKEND_PCM.buffer.slice(0) })) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  describe("auth", () => {
    it("rejects a request with no token and no x-vapi-secret", async () => {
      const res = await POST(req(`companyId=${COMPANY_ID}&employeeId=${EMPLOYEE_ID}&lang=ta`, voiceRequest(TA_Q1)));
      expect(res.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects a token signed for a different employee", async () => {
      const foreign = createWebhookToken(COMPANY_ID, "someone-else");
      const res = await POST(
        req(`companyId=${COMPANY_ID}&employeeId=${EMPLOYEE_ID}&lang=ta&token=${encodeURIComponent(foreign as string)}`, voiceRequest(TA_Q1))
      );
      expect(res.status).toBe(401);
    });

    it("accepts a valid signed URL token", async () => {
      const res = await POST(req(signedQs(), voiceRequest(TA_Q1)));
      expect(res.status).toBe(200);
    });

    it("accepts the x-vapi-secret header as the alternative credential", async () => {
      const r = new NextRequest("http://localhost/api/tts/vapi?lang=ta", {
        method: "POST",
        body: voiceRequest(TA_Q1),
        headers: { "Content-Type": "application/json", "x-vapi-secret": "wh9F8e7D6c5B4a32Secret10" },
      });
      const res = await POST(r);
      expect(res.status).toBe(200);
    });
  });

  describe("validation", () => {
    it("rejects a non-voice-request message", async () => {
      const res = await POST(req(signedQs(), JSON.stringify({ message: { type: "other", text: "hi" } })));
      expect(res.status).toBe(400);
    });

    it("rejects oversized text (text bomb)", async () => {
      const res = await POST(req(signedQs(), voiceRequest("அ".repeat(1001))));
      expect(res.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects an unsupported sampleRate", async () => {
      const res = await POST(req(signedQs(), voiceRequest(TA_Q1, 11025)));
      expect(res.status).toBe(400);
    });

    it("rejects invalid JSON", async () => {
      const res = await POST(req(signedQs(), "not-json"));
      expect(res.status).toBe(400);
    });

    it("enforces the per-tenant rate limit with 429", async () => {
      checkRateLimitDistributed.mockResolvedValue({ allowed: false });
      const res = await POST(req(signedQs(), voiceRequest(TA_Q1)));
      expect(res.status).toBe(429);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("PCM contract", () => {
    it("returns application/octet-stream raw PCM from the custom backend", async () => {
      const res = await POST(req(signedQs(), voiceRequest(TA_Q1)));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(res.headers.get("X-TTS-Provider")).toBe("custom");
      const body = Buffer.from(await res.arrayBuffer());
      expect(body.length).toBe(BACKEND_PCM.length);
      // The custom backend was asked for the request's exact rate.
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(init.body).sample_rate).toBe(24000);
    });

    it("resamples a 24kHz backend answer down to a 16kHz request (Vapi requires exact rate match)", async () => {
      // Force the Gemini path (returns 24k regardless of request) by making
      // the custom backend fail.
      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        if (String(url).includes("tts.internal.example")) return { ok: false, status: 503 };
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { mimeType: "audio/l16; rate=24000", data: BACKEND_PCM.toString("base64") } }],
                },
              },
            ],
          }),
        };
      });
      const res = await POST(req(signedQs("ta"), voiceRequest(TA_Q1, 16000)));
      expect(res.status).toBe(200);
      const body = Buffer.from(await res.arrayBuffer());
      // 0.1s of audio stays 0.1s: 1600 samples at 16kHz = 3200 bytes.
      expect(body.length).toBe(3200);
      expect(res.headers.get("X-TTS-Provider")).toBe("gemini");
    });
  });

  describe("language routing and fallback chain", () => {
    it("Tamil chain: custom failure falls back to Gemini", async () => {
      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        if (String(url).includes("tts.internal.example")) return { ok: false, status: 500 };
        if (String(url).includes("generativelanguage")) {
          return {
            ok: true,
            json: async () => ({
              candidates: [
                { content: { parts: [{ inlineData: { mimeType: "audio/l16; rate=24000", data: BACKEND_PCM.toString("base64") } }] } },
              ],
            }),
          };
        }
        throw new Error(`unexpected fetch ${url}`);
      });
      const res = await POST(req(signedQs("ta"), voiceRequest(TA_Q1)));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-TTS-Provider")).toBe("gemini");
    });

    it("English chain never consults Gemini: custom failure goes straight to OpenAI", async () => {
      const urls: string[] = [];
      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        urls.push(String(url));
        if (String(url).includes("tts.internal.example")) return { ok: false, status: 500 };
        if (String(url).includes("api.openai.com")) return { ok: true, arrayBuffer: async () => BACKEND_PCM.buffer.slice(0) };
        throw new Error(`unexpected fetch ${url}`);
      });
      const res = await POST(req(signedQs("en"), voiceRequest("Is our service or product something you need immediately?")));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-TTS-Provider")).toBe("openai");
      expect(urls.some((u) => u.includes("generativelanguage"))).toBe(false);
    });

    it("detects Tamil script when the lang param is missing", async () => {
      const token = createWebhookToken(COMPANY_ID, EMPLOYEE_ID);
      const res = await POST(
        req(`companyId=${COMPANY_ID}&employeeId=${EMPLOYEE_ID}&token=${encodeURIComponent(token as string)}`, voiceRequest(TA_Q1))
      );
      expect(res.status).toBe(200);
      // Cache write proves which language bucket the request routed into.
      expect(String(upload.mock.calls[0][1])).toContain("tts-cache/ta/");
    });

    it("returns a non-200 when EVERY provider fails, handing the call to Vapi's fallbackPlan", async () => {
      global.fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => "down", json: async () => ({}) })) as unknown as typeof fetch;
      const res = await POST(req(signedQs("ta"), voiceRequest(TA_Q1)));
      expect(res.status).toBe(502);
    });
  });

  describe("cache", () => {
    it("serves a cached utterance without touching any backend", async () => {
      download.mockResolvedValue({ data: { arrayBuffer: async () => BACKEND_PCM.buffer.slice(0) }, error: null });
      const res = await POST(req(signedQs(), voiceRequest(TA_Q1)));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-TTS-Cache")).toBe("hit");
      expect(global.fetch).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    });

    it("persists renders under a provider+language+rate-scoped key — Tamil and English audio can never collide", async () => {
      await POST(req(signedQs("ta"), voiceRequest("Same text either way")));
      await POST(req(signedQs("en"), voiceRequest("Same text either way")));
      const paths = upload.mock.calls.map((c) => String(c[1]));
      expect(paths[0]).toMatch(/^tts-cache\/ta\/custom\/[0-9a-f]{64}\.24000\.pcm$/);
      expect(paths[1]).toMatch(/^tts-cache\/en\/custom\/[0-9a-f]{64}\.24000\.pcm$/);
      expect(paths[0]).not.toBe(paths[1]);
    });
  });
});

describe("resolveProviderChain", () => {
  const ORIGINAL_ENV = process.env;
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("Tamil defaults to custom → gemini → openai; others to custom → openai", () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.TTS_TAMIL_PROVIDER;
    delete process.env.TTS_EN_PROVIDER;
    expect(resolveProviderChain("ta")).toEqual(["custom", "gemini", "openai"]);
    expect(resolveProviderChain("en")).toEqual(["custom", "openai"]);
    expect(resolveProviderChain("hi")).toEqual(["custom", "openai"]);
  });

  it("TTS_TAMIL_PROVIDER promotes a provider to the front without dropping the rest", () => {
    process.env = { ...ORIGINAL_ENV, TTS_TAMIL_PROVIDER: "gemini" };
    expect(resolveProviderChain("ta")).toEqual(["gemini", "custom", "openai"]);
  });

  it("ignores an unknown preferred provider", () => {
    process.env = { ...ORIGINAL_ENV, TTS_TAMIL_PROVIDER: "espeak" };
    expect(resolveProviderChain("ta")).toEqual(["custom", "gemini", "openai"]);
  });
});
