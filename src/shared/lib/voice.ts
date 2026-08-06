import { SUPPORTED_VOICE_IDS } from "@/core/domain/models/types";
import { Logger } from "@/shared/lib/logger";

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
  provider: "openai" | "11labs";
  voiceId: string;
  model: string;
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
  companyDefaultVoiceId?: string | null
): VoiceProviderConfig {
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
