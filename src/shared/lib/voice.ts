import { SUPPORTED_VOICE_IDS } from "@/core/domain/models/types";
import { Logger } from "@/shared/lib/logger";
import { createWebhookToken } from "@/shared/lib/webhookToken";

// OpenAI TTS voiceIds Vapi actually accepts for provider "openai" (per
// @vapi-ai/web's OpenAIVoice type). Agents store an arbitrary string in
// voice_model_id — some seeded/legacy values (e.g. "vapi-default") were
// never real voiceIds, just placeholder labels — so this validates
// against the known set instead of passing anything through verbatim,
// which would otherwise silently break the live call for any agent
// whose value isn't one of these.
//
// The list itself lives in the domain, where it is also the Employee voice
// dropdown's allowed set: one source of truth, so an option an admin can pick
// is by construction an option Vapi will accept.
const KNOWN_OPENAI_VOICE_IDS = SUPPORTED_VOICE_IDS;
export type OpenAIVoiceId = (typeof KNOWN_OPENAI_VOICE_IDS)[number];

export const DEFAULT_VOICE_ID: OpenAIVoiceId = "nova";

export function resolveOpenAIVoiceId(raw?: string | null): OpenAIVoiceId {
  const candidate = (raw || "").trim().toLowerCase();
  return (KNOWN_OPENAI_VOICE_IDS as readonly string[]).includes(candidate) ? (candidate as OpenAIVoiceId) : DEFAULT_VOICE_ID;
}

/** Precedence for a live call: the employee's own voice, then their agent's,
 * then the company default from Settings, then the platform default. Each
 * level is nullable precisely so that "unset" keeps inheriting — storing a
 * copy of the level above at edit time would freeze it against later changes.
 *
 * Shared by the public card route and the Vapi assistant-request handler so a
 * browser call and a phone call can never speak in different voices.
 *
 * Note the fall-through is on *usability*, not merely presence: the agents
 * table contains legacy values like "vapi-default" that are labels, not
 * voices. Treating those as set would pin every call to the platform default
 * and silently ignore the company's configured voice.
 */
export function resolveCallVoiceId(
  employeeVoiceId?: string | null,
  agentVoiceModelId?: string | null,
  companyDefaultVoiceId?: string | null
): OpenAIVoiceId {
  for (const candidate of [employeeVoiceId, agentVoiceModelId, companyDefaultVoiceId]) {
    const normalized = (candidate || "").trim().toLowerCase();
    if ((KNOWN_OPENAI_VOICE_IDS as readonly string[]).includes(normalized)) return normalized as OpenAIVoiceId;
  }
  return DEFAULT_VOICE_ID;
}

export interface VoiceProviderConfig {
  provider: "openai" | "11labs" | "custom-voice" | "azure";
  voiceId: string;
  model: string;
  /** custom-voice only: the absolute, HMAC-token-signed URL Vapi POSTs
   * voice-requests to (our /api/tts/vapi route). Absent on every other
   * provider. */
  serverUrl?: string;
}

/** Per-call context the custom-voice branch needs to mint its signed
 * endpoint URL. Optional everywhere: callers that don't pass it (or run
 * without a public base URL) simply keep the existing provider chain. */
export interface CustomTtsCallContext {
  language: string;
  companyId: string;
  employeeId: string;
  baseUrl: string | null | undefined;
}

/** True when the platform-wide custom TTS voice is enabled for this
 * employee. VOICE_TTS_PROVIDER=custom is the master switch;
 * VOICE_CUSTOM_TTS_EMPLOYEE_IDS (comma-separated) optionally narrows it to
 * a canary set of employees so one card can prove the pipeline before the
 * whole platform moves (migration phase 8). Empty/unset allowlist means
 * every employee once the master switch is on. */
function isCustomTtsEnabledFor(employeeId: string | undefined): boolean {
  if ((process.env.VOICE_TTS_PROVIDER || "").trim().toLowerCase() !== "custom") return false;
  const allowlist = (process.env.VOICE_CUSTOM_TTS_EMPLOYEE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return true;
  return Boolean(employeeId && allowlist.includes(employeeId));
}

/** The full provider+voice+model tuple for a live call — supersedes
 * resolveCallVoiceId, which only ever covered the OpenAI branch. Both the
 * public card route and the Vapi webhook call this so a browser call and a
 * phone call are never on two different providers.
 *
 * Platform-wide override, not per-tenant: when VOICE_ELEVENLABS_VOICE_ID is
 * set, every live call across every company uses this one ElevenLabs voice
 * instead of the per-employee/agent/company OpenAI resolution below.
 * Deliberately global rather than a second per-tenant provider system —
 * nothing asked for per-company provider choice, and OpenAI's TTS has no
 * Indian-language tuning at all (verified against its own model docs), so
 * "upgrade the whole platform's non-English quality" is the actual shape of
 * the need this serves.
 *
 * The ElevenLabs credential itself is never held by this app: Vapi calls
 * ElevenLabs directly, authenticated with a key linked in the Vapi
 * dashboard's own Provider Keys settings — these two env vars only tell Vapi
 * which voice and model to request once that link exists. Unset (the
 * default), every call keeps using the OpenAI path exactly as before.
 *
 * Reads process.env inside the function body, not at module load, purely so
 * tests can exercise both branches by mutating process.env per test without
 * needing module-registry resets.
 */
export function resolveVoiceProviderConfig(
  employeeVoiceId?: string | null,
  agentVoiceModelId?: string | null,
  companyDefaultVoiceId?: string | null,
  customTtsContext?: CustomTtsCallContext
): VoiceProviderConfig {
  // Highest-precedence opt-in: our own TTS endpoint (self-hosted Indic model
  // behind /api/tts/vapi). Requires the full call context AND a public base
  // URL AND a signable token — missing any of these falls straight through
  // to the existing chain, so a misconfiguration degrades to today's
  // behavior instead of a silent dead-air call.
  if (customTtsContext && isCustomTtsEnabledFor(customTtsContext.employeeId)) {
    const { language, companyId, employeeId, baseUrl } = customTtsContext;
    const token = baseUrl ? createWebhookToken(companyId, employeeId) : null;
    if (baseUrl && token) {
      const serverUrl =
        `${baseUrl}/api/tts/vapi?companyId=${encodeURIComponent(companyId)}&employeeId=${encodeURIComponent(employeeId)}` +
        `&lang=${encodeURIComponent(language)}&token=${encodeURIComponent(token)}`;
      // Same visibility rationale as the ElevenLabs override below: this
      // silently supersedes every tenant's configured voice, so it must
      // leave a server-side trace.
      Logger.warn("Custom TTS voice active", { employeeId, language });
      return { provider: "custom-voice", voiceId: "custom", model: "custom", serverUrl };
    }
    Logger.warn("VOICE_TTS_PROVIDER=custom set but base URL or webhook secret missing — falling back to standard voice chain", {
      hasBaseUrl: Boolean(baseUrl),
    });
  }
  // Language-scoped Azure branch: Vapi supports Azure TTS natively (at-cost,
  // no Azure account required), and Azure has REAL Tamil neural voices
  // (ta-IN-PallaviNeural / ta-IN-ValluvarNeural) — the cheapest fix for the
  // known OpenAI-speaks-Tamil-as-gibberish problem: one env var, no infra.
  // Scoped to Tamil calls only (needs the call context to know the
  // language); every other language keeps its existing chain. Sits below the
  // custom-voice opt-in so a self-hosted rollout, when proven, wins.
  const azureTamilVoiceId = process.env.VOICE_AZURE_TAMIL_VOICE_ID?.trim();
  if (azureTamilVoiceId && customTtsContext?.language === "ta") {
    Logger.warn("Azure Tamil voice active", { voiceId: azureTamilVoiceId });
    return { provider: "azure", voiceId: azureTamilVoiceId, model: "azure" };
  }
  const elevenLabsVoiceId = process.env.VOICE_ELEVENLABS_VOICE_ID?.trim();
  if (elevenLabsVoiceId) {
    // eleven_multilingual_v2 is required for Tamil — the default
    // eleven_turbo_v2 model is English-tuned and would silently produce
    // worse output.
    const model = process.env.VOICE_ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2";
    // This silently overrides every tenant's configured OpenAI voice, so a
    // trace of it firing belongs in the logs — otherwise a report of "wrong
    // voice on my call" has no server-side signal pointing at this env var.
    Logger.warn("Platform-wide ElevenLabs voice override active", { voiceId: elevenLabsVoiceId, model });
    return { provider: "11labs", voiceId: elevenLabsVoiceId, model };
  }
  return {
    provider: "openai",
    voiceId: resolveCallVoiceId(employeeVoiceId, agentVoiceModelId, companyDefaultVoiceId),
    model: "tts-1-hd",
  };
}
