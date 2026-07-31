// OpenAI TTS voiceIds Vapi actually accepts for provider "openai" (per
// @vapi-ai/web's OpenAIVoice type). Agents store an arbitrary string in
// voice_model_id — some seeded/legacy values (e.g. "vapi-default") were
// never real voiceIds, just placeholder labels — so this validates
// against the known set instead of passing anything through verbatim,
// which would otherwise silently break the live call for any agent
// whose value isn't one of these.
const KNOWN_OPENAI_VOICE_IDS = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "marin", "cedar"] as const;
export type OpenAIVoiceId = (typeof KNOWN_OPENAI_VOICE_IDS)[number];

export const DEFAULT_VOICE_ID: OpenAIVoiceId = "nova";

export function resolveOpenAIVoiceId(raw?: string | null): OpenAIVoiceId {
  const candidate = (raw || "").trim().toLowerCase();
  return (KNOWN_OPENAI_VOICE_IDS as readonly string[]).includes(candidate) ? (candidate as OpenAIVoiceId) : DEFAULT_VOICE_ID;
}
