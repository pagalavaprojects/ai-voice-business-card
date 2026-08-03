import { SUPPORTED_VOICE_IDS } from "@/core/domain/models/types";

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
