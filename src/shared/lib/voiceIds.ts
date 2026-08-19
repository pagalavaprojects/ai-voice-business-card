import { SUPPORTED_VOICE_IDS } from "@/core/domain/models/types";

/**
 * Client-safe voice-ID constants, split out of shared/lib/voice.ts
 * (2026-08-19 bundle audit): voice.ts value-imports createWebhookToken →
 * Node `crypto`, and useVapiSession's import of these constants from there
 * dragged a 317 KB crypto-browserify polyfill chunk into the public card's
 * INITIAL JS — the largest chunk on the page, serving no client purpose.
 * voice.ts re-exports everything here, so server-side callers are untouched.
 *
 * OpenAI TTS voiceIds Vapi actually accepts for provider "openai" (per
 * @vapi-ai/web's OpenAIVoice type). Agents store an arbitrary string in
 * voice_model_id — some seeded/legacy values (e.g. "vapi-default") were
 * never real voiceIds, just placeholder labels — so resolveOpenAIVoiceId
 * validates against the known set instead of passing anything through
 * verbatim, which would otherwise silently break the live call for any
 * agent whose value isn't one of these.
 *
 * The list itself lives in the domain, where it is also the Employee voice
 * dropdown's allowed set: one source of truth, so an option an admin can
 * pick is by construction an option Vapi will accept.
 */
export const KNOWN_OPENAI_VOICE_IDS = SUPPORTED_VOICE_IDS;
export type OpenAIVoiceId = (typeof KNOWN_OPENAI_VOICE_IDS)[number];

export const DEFAULT_VOICE_ID: OpenAIVoiceId = "nova";

export function resolveOpenAIVoiceId(raw?: string | null): OpenAIVoiceId {
  const candidate = (raw || "").trim().toLowerCase();
  return (KNOWN_OPENAI_VOICE_IDS as readonly string[]).includes(candidate) ? (candidate as OpenAIVoiceId) : DEFAULT_VOICE_ID;
}
