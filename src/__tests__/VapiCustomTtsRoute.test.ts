import { NextRequest } from "next/server";

/**
 * The endpoint Vapi calls to speak.
 *
 * This is the single audio path: Vapi asks for the utterance, we answer with
 * PCM, Vapi streams it into the call. Nothing is played in the browser
 * alongside it, so a visitor can never hear the question twice.
 *
 * The properties worth pinning are the ones that decide whether a live
 * conversation stalls: a warmed utterance must be served from storage without
 * touching a provider, and a provider that cannot possibly answer must not
 * cost a storage round trip before it fails.
 */

const download = jest.fn();
const renderGeminiPcm = jest.fn();
const renderOpenAiPcm = jest.fn();
const renderCustomPcm = jest.fn();
const upload = jest.fn();

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: { storage: { from: () => ({ download }) } },
}));

jest.mock("@/core/infrastructure/storage/SupabaseStorageAdapter", () => ({
  SupabaseStorageAdapter: jest.fn().mockImplementation(() => ({
    ensureBucket: jest.fn().mockResolvedValue(undefined),
    upload,
  })),
}));

jest.mock("@/shared/lib/rateLimit", () => ({
  checkRateLimitDistributed: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock("@/shared/lib/webhookToken", () => ({
  verifyWebhookToken: (token: string | null) => token === "valid-token",
}));

jest.mock("@/shared/lib/security", () => ({
  validateVapiWebhookSignature: () => false,
}));

jest.mock("@/shared/lib/tts/ttsBackends", () => {
  const actual = jest.requireActual("@/shared/lib/tts/ttsBackends");
  return {
    ...actual,
    renderGeminiPcm: (...args: unknown[]) => renderGeminiPcm(...args),
    renderOpenAiPcm: (...args: unknown[]) => renderOpenAiPcm(...args),
    renderCustomPcm: (...args: unknown[]) => renderCustomPcm(...args),
  };
});

import { POST } from "@/app/api/tts/vapi/route";
import { qualificationUtterances } from "@/features/voice/lib/qualificationAudio";

const COMPANY = "33333333-3333-3333-3333-333333333333";
const EMPLOYEE = "44444444-4444-4444-4444-444444444444";
const Q1_EN = qualificationUtterances("en")[0].text;
const Q1_TA = qualificationUtterances("ta")[0].text;

function voiceRequest(text: string, lang: string, token = "valid-token"): NextRequest {
  const req = new NextRequest(
    `https://maylaanai.com/api/tts/vapi?companyId=${COMPANY}&employeeId=${EMPLOYEE}&lang=${lang}&token=${token}`,
    { method: "POST" }
  );
  req.json = async () => ({ message: { type: "voice-request", text, sampleRate: 24000 } });
  return req;
}

/** A stand-in for stored PCM: 16-bit mono samples. */
const storedPcm = () => ({ arrayBuffer: async () => new Uint8Array(4800).buffer });

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, GEMINI_API_KEY: "AIzaSyRealLookingKeyValue", OPENAI_API_KEY: "", CUSTOM_TTS_URL: "", CUSTOM_TTS_API_KEY: "" };
  download.mockResolvedValue({ data: null, error: new Error("not found") });
  renderGeminiPcm.mockResolvedValue({ pcm: Buffer.alloc(4800), sampleRate: 24000 });
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("POST /api/tts/vapi", () => {
  it("refuses an unsigned request", async () => {
    const res = await POST(voiceRequest(Q1_EN, "en", "not-the-token"));
    expect(res.status).toBe(401);
    expect(renderGeminiPcm).not.toHaveBeenCalled();
  });

  it("serves a warmed English question from the cache without calling a provider", async () => {
    download.mockResolvedValue({ data: storedPcm(), error: null });

    const res = await POST(voiceRequest(Q1_EN, "en"));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-TTS-Cache")).toBe("hit");
    expect(res.headers.get("X-TTS-Provider")).toBe("gemini");
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    // The whole point of warming: nothing is generated while somebody waits.
    expect(renderGeminiPcm).not.toHaveBeenCalled();
  });

  it("serves a warmed Tamil question from the cache too", async () => {
    download.mockResolvedValue({ data: storedPcm(), error: null });

    const res = await POST(voiceRequest(Q1_TA, "ta"));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-TTS-Cache")).toBe("hit");
    expect(renderGeminiPcm).not.toHaveBeenCalled();
  });

  it("renders and stores an utterance that was never warmed, rather than going silent", async () => {
    const res = await POST(voiceRequest("Something nobody pre-recorded.", "en"));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-TTS-Cache")).toBe("miss");
    expect(renderGeminiPcm).toHaveBeenCalled();
    // Rendered once, kept for next time.
    expect(upload).toHaveBeenCalled();
  });

  it("does not spend a storage lookup on a provider that has no credential", async () => {
    // Only Gemini is configured, so the chain must collapse to Gemini alone —
    // each unusable provider would otherwise cost a round trip mid-call.
    await POST(voiceRequest(Q1_EN, "en"));
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("falls back to Vapi's own voice rather than dying when nothing can render", async () => {
    process.env = { ...ORIGINAL_ENV, GEMINI_API_KEY: "", OPENAI_API_KEY: "", CUSTOM_TTS_URL: "", CUSTOM_TTS_API_KEY: "" };

    const res = await POST(voiceRequest(Q1_EN, "en"));

    // A non-200 is what triggers Vapi's configured fallback plan, so the
    // question is still spoken — with the wrong voice, but never skipped.
    expect(res.status).toBe(502);
  });

  it("keeps the question text intact on the fallback path", async () => {
    download.mockResolvedValue({ data: null, error: new Error("gone") });
    renderGeminiPcm.mockResolvedValue({ pcm: Buffer.alloc(2400), sampleRate: 24000 });

    await POST(voiceRequest(Q1_TA, "ta"));

    // Whatever renders it, it renders THIS text — a fallback must never
    // paraphrase or drop the question.
    expect(renderGeminiPcm).toHaveBeenCalledWith(Q1_TA, expect.any(Number));
  });

  it("rejects an oversized utterance instead of paying to render it", async () => {
    const res = await POST(voiceRequest("x".repeat(1001), "en"));
    expect(res.status).toBe(400);
  });
});
