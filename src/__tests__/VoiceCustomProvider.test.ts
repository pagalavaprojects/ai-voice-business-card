/**
 * resolveVoiceProviderConfig — the opt-in "custom-voice" branch (platform
 * TTS endpoint). The one non-negotiable here: with the env switch UNSET,
 * behavior is byte-identical to before this feature existed, context or no
 * context — production cannot drift onto the new path by accident. The
 * 11labs/openai branches themselves are covered in Employees.test.ts.
 */
import { resolveVoiceProviderConfig } from "@/shared/lib/voice";
import { verifyWebhookToken } from "@/shared/lib/webhookToken";

const CTX = {
  language: "ta",
  companyId: "company-1",
  employeeId: "employee-1",
  baseUrl: "https://maylaanai.com",
};

describe("resolveVoiceProviderConfig — custom-voice opt-in", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, VAPI_WEBHOOK_SECRET: "wh9F8e7D6c5B4a32Secret10" };
    delete process.env.VOICE_TTS_PROVIDER;
    delete process.env.VOICE_CUSTOM_TTS_EMPLOYEE_IDS;
    delete process.env.VOICE_ELEVENLABS_VOICE_ID;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("is inert while VOICE_TTS_PROVIDER is unset — context or not, the OpenAI chain is untouched", () => {
    expect(resolveVoiceProviderConfig("shimmer", null, null, CTX)).toEqual({
      provider: "openai",
      voiceId: "shimmer",
      model: "tts-1-hd",
    });
    expect(resolveVoiceProviderConfig("shimmer", null, null)).toEqual({
      provider: "openai",
      voiceId: "shimmer",
      model: "tts-1-hd",
    });
  });

  it("returns custom-voice with a signed /api/tts/vapi URL when enabled with full context", () => {
    process.env.VOICE_TTS_PROVIDER = "custom";
    const config = resolveVoiceProviderConfig(null, null, null, CTX);
    expect(config.provider).toBe("custom-voice");
    const url = new URL(config.serverUrl as string);
    expect(url.origin).toBe("https://maylaanai.com");
    expect(url.pathname).toBe("/api/tts/vapi");
    expect(url.searchParams.get("companyId")).toBe("company-1");
    expect(url.searchParams.get("employeeId")).toBe("employee-1");
    expect(url.searchParams.get("lang")).toBe("ta");
    // The token in the URL must actually authenticate against the same
    // verifier the route uses — scoped to this exact company/employee.
    expect(verifyWebhookToken(url.searchParams.get("token"), "company-1", "employee-1")).toBe(true);
    expect(verifyWebhookToken(url.searchParams.get("token"), "company-1", "other-employee")).toBe(false);
  });

  it("takes precedence over the ElevenLabs platform override when both are set", () => {
    process.env.VOICE_TTS_PROVIDER = "custom";
    process.env.VOICE_ELEVENLABS_VOICE_ID = "el-voice-1";
    expect(resolveVoiceProviderConfig(null, null, null, CTX).provider).toBe("custom-voice");
  });

  it("canary allowlist: only listed employees get the custom voice, everyone else keeps the standard chain", () => {
    process.env.VOICE_TTS_PROVIDER = "custom";
    process.env.VOICE_CUSTOM_TTS_EMPLOYEE_IDS = "employee-1, employee-9";
    expect(resolveVoiceProviderConfig(null, null, null, CTX).provider).toBe("custom-voice");
    expect(
      resolveVoiceProviderConfig(null, null, null, { ...CTX, employeeId: "employee-2" }).provider
    ).toBe("openai");
  });

  it("falls back to the standard chain when no public base URL exists", () => {
    process.env.VOICE_TTS_PROVIDER = "custom";
    expect(resolveVoiceProviderConfig(null, null, null, { ...CTX, baseUrl: null }).provider).toBe("openai");
  });

  it("falls back to the standard chain when no webhook secret exists to sign the token", () => {
    process.env.VOICE_TTS_PROVIDER = "custom";
    delete process.env.VAPI_WEBHOOK_SECRET;
    expect(resolveVoiceProviderConfig(null, null, null, CTX).provider).toBe("openai");
  });

  it("falls back to the standard chain when no call context is available at all", () => {
    process.env.VOICE_TTS_PROVIDER = "custom";
    expect(resolveVoiceProviderConfig("shimmer", null, null).provider).toBe("openai");
  });
});

describe("resolveVoiceProviderConfig — Azure Tamil voice opt-in", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, VAPI_WEBHOOK_SECRET: "wh9F8e7D6c5B4a32Secret10" };
    delete process.env.VOICE_TTS_PROVIDER;
    delete process.env.VOICE_AZURE_TAMIL_VOICE_ID;
    delete process.env.VOICE_ELEVENLABS_VOICE_ID;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("routes a TAMIL call to the Azure voice when configured — English calls stay untouched", () => {
    process.env.VOICE_AZURE_TAMIL_VOICE_ID = "ta-IN-PallaviNeural";
    expect(resolveVoiceProviderConfig(null, null, null, CTX)).toEqual({
      provider: "azure",
      voiceId: "ta-IN-PallaviNeural",
      model: "azure",
    });
    expect(resolveVoiceProviderConfig("shimmer", null, null, { ...CTX, language: "en" })).toEqual({
      provider: "openai",
      voiceId: "shimmer",
      model: "tts-1-hd",
    });
  });

  it("is inert without call context (no language to scope to)", () => {
    process.env.VOICE_AZURE_TAMIL_VOICE_ID = "ta-IN-PallaviNeural";
    expect(resolveVoiceProviderConfig("shimmer", null, null).provider).toBe("openai");
  });

  it("yields to the custom-voice opt-in when both are enabled", () => {
    process.env.VOICE_AZURE_TAMIL_VOICE_ID = "ta-IN-PallaviNeural";
    process.env.VOICE_TTS_PROVIDER = "custom";
    expect(resolveVoiceProviderConfig(null, null, null, CTX).provider).toBe("custom-voice");
  });
});
