# Voice Provider Comparison: Should the AI Voice Business Card Platform Replace or Supplement Vapi?

**Type:** Research / decision document. **No source code was changed to produce this report.**
**Scope:** Evaluate Vapi against OpenAI Realtime API, LiveKit (Agents), Daily.co, ElevenLabs Conversational AI, Retell AI, Deepgram (Voice Agent API), Hume AI, and Cartesia, for this project specifically.
**Date:** 2026-08-07

---

## TL;DR

- **Full migration off Vapi is not justified right now.** The coupling is real but the business logic (tool execution, prompt assembly, CRM/booking) is already vendor-neutral — what's Vapi-specific is the call-transport/session layer, and several of the workarounds in it (mic-mute timing, loudness enhancement, reconnect logic) were hand-tuned against Vapi's own undocumented SDK internals through real production incidents. Re-deriving that against a new vendor is nontrivial work with real regression risk, and no concrete platform-level failure (cost, reliability, or a hard capability blocker) currently justifies taking that risk.
- **A full abstraction interface is not worth building now.** The two seams that would matter for a future swap (`resolveVoiceProviderConfig`, `resolveTranscriberConfig` in `src/shared/lib/voice.ts` / `src/features/language/server.ts`) already exist and are already reasonably clean. The parts that *aren't* clean (the client call-lifecycle state machine in `useVapiSession.ts`) are so keyed to Vapi's specific event model that designing a generic interface today would be guessing — that interface should be reverse-engineered from a second real implementation, not designed in the abstract.
- **If one alternative is worth a hands-on prototype, it's ElevenLabs Conversational AI** — it's the only full-orchestration alternative with explicit, named support for all six target languages (including Telugu and Malayalam, the two languages this project's own code cannot currently confirm), and the team already has a live production relationship with ElevenLabs today (it's already Vapi's TTS vendor for the `11labs` voice path). The main thing to validate is WebRTC client SDK maturity, which currently trails Vapi's.
- **Separately, and possibly more urgent:** the project's own code comments say Deepgram doesn't support Telugu/Malayalam. That was true when written, but Deepgram's Nova-3 model added Tamil, Telugu, and Kannada support in its January 2026 changelog. Telugu may already be fixable by upgrading/re-verifying the existing Vapi→Deepgram integration, with no vendor change at all. Malayalam still has no confirmed transcription vendor anywhere in this research except Cartesia and ElevenLabs.

---

## 1. How deep is the Vapi coupling, really?

Four files were read in full to answer this: `src/features/voice/hooks/useVapiSession.ts`, `src/app/api/vapi/webhook/route.ts`, `src/core/application/tools/ToolRegistry.ts`, and `src/shared/lib/voice.ts` (plus `src/features/language/config.ts` / `server.ts`, and `src/core/infrastructure/bootstrap/assistantRuntime.ts` for how the pieces wire together).

The honest finding: **coupling is shallow in the business logic and deep in the transport/session layer.** These are not evenly distributed.

### 1.1 What's already vendor-neutral (the good news)

- **`ToolRegistry`** (`src/core/application/tools/ToolRegistry.ts`) has zero Vapi imports and zero Vapi-shaped logic. `save_lead`, `book_appointment`, `search_products`, `search_services`, `search_faqs`, `search_knowledge_base`, `get_company_information`, `get_employee_information` are plain domain functions operating on repositories (`ICRMRepository`, `IBookingRepository`, `IKnowledgeRepository`), a `CalcomAdapter`, and a `NotificationService`. The only Vapi-adjacent thing about it is the shape `getAllToolDefinitions()` emits: `{ type: "function", function: { name, description, parameters } }` — which is OpenAI's function-calling schema, not Vapi's own invention. Vapi, OpenAI Realtime, and (with minor reshaping) most of the other platforms in this comparison all consume that same schema family.
- **`PromptAssemblyService`, `NotificationService`, `CalcomAdapter`, all Supabase repositories** — none of this has any Vapi awareness. `assistantRuntime.ts` wires these once and hands the assembled prompt + tool list to whichever caller needs them.
- **`resolveVoiceProviderConfig`** and **`resolveTranscriberConfig`** (`src/shared/lib/voice.ts`, `src/features/language/server.ts`) already return small, vendor-agnostic tuples (`{provider, voiceId, model}`, `{provider, language}`) computed from company/employee/settings precedence — this *is* a working seam. It's just a narrow one (voice/transcriber choice only, not call transport).

### 1.2 What's genuinely Vapi-specific (the real coupling)

**Client hook (`useVapiSession.ts`):**
- Imports `@vapi-ai/web` directly; the whole hook is built around Vapi's specific event model (`call-start`, `call-end`, `speech-start`, `speech-end`, `message` with `transcriptType`, `error`) and Vapi's `.start()` config shape (nested `model`/`voice`/`transcriber`/`server` objects that are Vapi's own schema, cast via `VapiStartParam = Parameters<InstanceType<typeof Vapi>["start"]>[0]`).
- Several workarounds are keyed to **Vapi's own undocumented internal behavior**, not just its public API — these are the hardest parts to port:
  - Mic force-mute during the scripted intro is timed to `call-start` specifically because that's "the earliest point `this.call` reliably exists (confirmed against the SDK source)" — an internal implementation detail, not a documented contract.
  - A comment notes Daily's own `startAudioOff` option is accepted by the SDK's types but "never actually forwarded to Daily's call object — verified dead, not used" — i.e., the team had to read Vapi's own SDK source to find a dead code path and route around it.
  - There is no "assistant finished speaking" event in Vapi's SDK, so the hook approximates it with a hardcoded 3-second timer after the final transcript chunk.
  - A custom Web Audio loudness-enhancement chain (`src/features/voice/lib/audioEnhancement.ts`, `installVapiLoudnessEnhancement`) exists specifically because "Vapi's SDK exposes no volume/gain control at all... it mounts a plain `<audio>` element straight to `document.body`" — the fix is a `MutationObserver` that intercepts Vapi's own DOM output and reroutes it through a gain → compressor → limiter chain. This is about as vendor-specific as client code gets.
  - A bounded one-shot auto-reconnect exists because Vapi calls can drop with no retry of its own.
- None of this is business logic — it's entirely about compensating for gaps/quirks in one specific vendor's WebRTC client SDK.

**Server webhook (`src/app/api/vapi/webhook/route.ts`):**
- The whole route is structured around Vapi's specific webhook envelope (`{ message: { type, call, toolCalls, ... } }`) and its three event types (`assistant-request`, `tool-calls`, `end-of-call-report`), each with Vapi's own field names (e.g. `call.customer.extension` is repurposed to smuggle `companyId` through a field Vapi designed for phone-call customer metadata — a Vapi-specific hack, not a generic pattern).
- Auth is a real, previously-broken piece of Vapi-specific plumbing: git history (`f98aad8`) shows a production incident where every webhook 401'd because "an inline `server` object [from the browser-started call] OVERRIDES the assistant's dashboard server settings — including its secret," forcing the team to build a second, self-signed HMAC token auth path (`verifyWebhookToken`) alongside Vapi's own `x-vapi-secret` header check. That's Vapi-specific behavior the team had to reverse-engineer from a production outage, not something documented up front.
- Tool-call results must be returned in Vapi's exact shape: `{ results: [{ toolCallId, result: JSON.stringify(result) }] }`.
- Call recording archival (`archiveRecording`) depends on Vapi's own storage URLs and, per a code comment, actually requires `VAPI_API_KEY` credentials to download reliably (unauthenticated GETs are rejected).
- Separately, git history (`0b5bfa4`) shows a prior incident where live calls silently ran with **no system prompt, no tools, and no webhook URL** for a period, because the browser's inline assistant config has to explicitly pass `model.messages`, `model.tools`, and `server.url` or Vapi silently defaults to a bare model — another Vapi-specific footgun the team already stepped on once.

**Voice/language config:** `resolveVoiceProviderConfig` and `resolveTranscriberConfig` are vendor-neutral in *shape*, but their *values* (`"tts-1-hd"`, `"eleven_multilingual_v2"`, transcriber provider names `"deepgram"`/`"azure"`) are constrained by what Vapi's integrations happen to expose, and the Telugu/Malayalam transcriber gap described in §3 exists specifically because of how Vapi bundles Deepgram/Azure, not because of a limitation in this app's own code.

### 1.3 Net assessment

The **domain/application layer is already a clean seam** — no rework needed there for any of the alternatives below. The **transport/session layer is the actual coupling**, and it's coupling to *specific undocumented vendor behavior discovered through incidents*, not just to a swappable interface. That distinction matters directly for the recommendation in §5.

---

## 2. Comparison table

"Category" distinguishes a full orchestration platform (dashboard, call state, tool-calling, telephony, webhooks — a Vapi-shaped product) from a component you'd still need to wire into something like LiveKit/Pipecat/your own server yourself.

| Provider | Category | Pricing model | Function/tool calling | Webhook/callback equivalent | WebRTC client SDK maturity | Confirmed Indian-language coverage (of this project's 6) |
|---|---|---|---|---|---|---|
| **Vapi (current)** | Full orchestration platform | Per-minute, marked up over underlying LLM/STT/TTS | Yes — OpenAI-schema tools, used today | Yes — `assistant-request`/`tool-calls`/`end-of-call-report`, in production (with a self-signed-token workaround for a dashboard-secret bug) | Mature, in production; built on Daily.co's transport underneath | en/ta/hi/kn confirmed (Deepgram); te/ml unconfirmed — gated behind an unverifiable manual Azure dashboard link, off by default |
| **OpenAI Realtime API** | Component (model-level speech-to-speech; no dashboard, telephony, or call-orchestration layer) | Token-based: audio+text in/out, ~$0.04–0.10/min (gpt-realtime), ~1/3 that on mini; cached audio ~99% cheaper | Yes, native — same schema as OpenAI Chat/Responses tools, reusable as-is from `ToolRegistry` | None built-in — you run your own session server; tool calls surface as in-connection function-call events, not HTTP webhooks | Official WebRTC connect method exists, but low-level — no built-in reconnect/mute/loudness helpers; you rebuild what `useVapiSession.ts` already built | Newest models (GPT-Realtime-2 / -Translate, May 2026) claim 70+ languages incl. Hindi/Tamil/Telugu with a published lower-WER benchmark; Kannada/Malayalam not specifically benchmarked. The **original** Realtime API was explicitly not optimized for Indian languages — this is a recent, not-yet-battle-tested improvement |
| **LiveKit (Agents)** | Full orchestration framework (open-source, self-host or LiveKit Cloud) | Component-based: WebRTC minutes $0.0004–0.0005/min + Agent session minutes $0.01/min + BYO STT/LLM/TTS costs; free tier 5K WebRTC + 1K agent min/mo | Yes, framework-native, LLM-agnostic, can forward to frontend | No HTTP-webhook-per-event model — your Agent process calls your tool-execution code in-process; LiveKit Cloud also offers room/session lifecycle webhooks | Mature and broad (JS/React, Swift, Android, Flutter, RN) — arguably the most general-purpose WebRTC client SDK of the group | No native STT/TTS — inherits whatever you plug in. Achievable **today** via Deepgram Nova-3 (en/ta/te/kn) or Cartesia (all 6, see below) plugins, but that integration/QA work is yours |
| **Daily.co (+ Daily Bots / Pipecat Cloud)** | Raw WebRTC transport, or (via Pipecat Cloud, GA Jan 2026) a full orchestration platform | Transport: $0.004/participant-min after 10K free, graduated discounts; Pipecat Cloud agent-minutes from $0.01/min | Yes, via Pipecat's pipeline model | Same in-process pattern as LiveKit, plus Daily's own room/recording webhooks | Mature, long-established WebRTC vendor (JS, RN, iOS, Android) | Same BYO story as LiveKit — no native language guarantee. **Note: Daily is the literal transport Vapi is already built on** (confirmed via Daily's own "Daily and Vapi partner" post) — swapping to raw Daily transport alone gains nothing Vapi doesn't already provide |
| **ElevenLabs Conversational AI** | Full orchestration platform | ~$0.08–0.10/min (Business ~8¢, Creator/Pro ~10¢); LLM cost separate. Standalone TTS: $0.10/1K chars (v2/v3), $0.05/1K (flash/turbo) | Yes — client tools (browser), server tools (webhooks, JSON or form-encoded), plus MCP server support | Yes — explicit "server tools" webhook type, closest conceptual match to this app's existing `tool-calls` handler | WebRTC is **new**: live now in JS npm package and Swift SDK; React Native and Android WebRTC "coming shortly" as of this research — behind Vapi's/LiveKit's maturity today; WebSocket fallback exists but loses native WebRTC echo-cancellation | **All 6 confirmed by name.** Multilingual v3 lists 90+ languages including 11 named Indian regional languages (Hindi, Tamil, Malayalam, Kannada, Telugu, Gujarati, …) — the only alternative with explicit vendor confirmation of Telugu *and* Malayalam |
| **Retell AI** | Full orchestration platform (closest like-for-like Vapi competitor) | $0.07/min platform base, but LLM/voice-engine/telephony are separate add-ons — realistic all-in cost $0.13–0.31/min | Yes, native, positioned for CRM/real-time data exchange | Yes — "extensive" webhook + REST integration, comparable surface to Vapi | Comparable maturity tier to Vapi (same product generation) | Hindi explicitly confirmed repeatedly. **Tamil, Telugu, Malayalam, and Kannada do not appear in Retell's own published 55-language list** found in this research — a real, currently-worse gap than Vapi already has today for those four languages. Verify directly before assuming; not found, not proven absent |
| **Deepgram (Voice Agent API / Nova-3+Aura-2)** | Bundled streaming endpoint (STT+LLM+TTS) — thinner than a full platform: no dashboard/telephony/call-archival layer | Voice Agent API: $4.50/hr (~$0.075–0.08/min) bundled, or $0.07/min BYO-LLM (STT/TTS only) — cheaper than Vapi/Retell all-in rates, but you own orchestration | Yes, plus mid-conversation prompt updates (not cleanly exposed by Vapi's webhook model) | No HTTP-webhook-per-event model — single WebSocket connection from your own server; you call tool-execution code in that connection handler | WebSocket-based, **not WebRTC** — no browser-native client SDK in the Vapi/LiveKit sense; needs your own server hop or accepts raw WebSocket audio (loses WebRTC's jitter-buffer/echo-cancellation) | **en/hi/ta/te/kn confirmed** (Nova-3, Hindi long-standing, Tamil/Telugu/Kannada added Jan 2026 changelog). **Malayalam not found in any Nova-3 language list in this research.** This app already indirectly depends on Deepgram today via Vapi's transcriber integration |
| **Hume AI (EVI)** | Full speech-to-speech platform, differentiated by prosody/emotion modeling | Subscription tiers $3–$500/mo bundling "Octave characters" + EVI minutes + concurrency — awkward fit for unpredictable B2B call volume; Enterprise custom pricing exists but no public per-minute rate found | Yes, but **gated**: only works with specific supplemental LLMs (Claude/GPT/Gemini/Moonshot) or a custom LLM using the OpenAI function-calling spec | Yes — purpose-built EVI webhooks with HMAC signature + timestamp (arguably more security-conscious by default than Vapi's, which this project had to patch around) | SDKs for TypeScript, Python, .NET, Swift; no explicit React/React Native WebRTC maturity signal found; generally treated as a smaller/specialized player | EVI 3 "supports 11 languages" with no breakdown found, and **no Indian regional language confirmed anywhere in this research**. Given Hume's core differentiator (prosody/emotion) is itself English-centric research territory, treat as unconfirmed and unpromising for this requirement |
| **Cartesia** | Pure component — Sonic (TTS) + Ink-Whisper (STT); explicitly meant to plug into someone else's orchestration (confirmed available as a drop-in inside Vapi and as a LiveKit plugin) | Credit-based: TTS ~$0.03/min generated audio; Ink-Whisper STT ~$0.13/hr (~1 credit/sec) on Scale plan — cheap, but only one leg of a call | Not applicable — no orchestration layer | Not applicable | Not applicable directly — consumed server-side or via a partner SDK (e.g. LiveKit's Cartesia plugin), not connected to from a browser directly | **All 6 confirmed by name** — 9 Indian languages listed including Hindi, Tamil, Telugu, Kannada, Malayalam; described as better Indian-language coverage than any competitor except Google Cloud TTS. Notably, **Cartesia's Ink-Whisper STT is already available inside Vapi today** as a drop-in transcriber option |

---

## 3. Language support deep dive

This project supports English, Tamil, Hindi, Telugu, Malayalam, and Kannada (`src/features/language/config.ts`). The project's own code comments already document real, specific gaps in the current Vapi setup — this section checks each alternative against exactly those gaps rather than against generic marketing claims.

**What the code says about Vapi's current gaps (verbatim intent, `src/features/language/config.ts` and `server.ts`):**
- Deepgram (Vapi's transcriber) directly supports `en`/`ta`/`hi`/`kn` — "confirmed by reading the SDK's own closed union type, not assumed."
- Telugu and Malayalam are "NOT in Deepgram's supported-language list" per the same SDK types.
- Azure covers `te-IN`/`ml-IN`, but requires Azure Speech to be linked as a provider key in Vapi's own dashboard — something "this app has no way to detect or verify," so it's gated behind `VAPI_AZURE_SPEECH_ENABLED` (off by default). **Today, in production, Telugu and Malayalam calls most likely fall back to Vapi's undocumented platform-default transcriber** rather than a confirmed-working one for that language.

**What changed since that comment was written:** Deepgram's Nova-3 model added Tamil, Telugu, and Kannada to its supported-language list in a January 2026 changelog. Telugu specifically may now be directly supported by the same Deepgram integration Vapi already uses — this is worth re-verifying against Vapi's current transcriber options before assuming Azure (or a vendor swap) is required at all. Malayalam is still not found in any Deepgram language list in this research.

| Language | Vapi today (as shipped) | ElevenLabs | Cartesia | Deepgram (direct) | LiveKit/Daily (BYO) | OpenAI Realtime (new models) | Retell | Hume |
|---|---|---|---|---|---|---|---|---|
| English | Confirmed | Confirmed | Confirmed | Confirmed | Confirmed (any plugin) | Confirmed | Confirmed | Confirmed |
| Tamil | Confirmed (Deepgram) | Confirmed | Confirmed | Confirmed (Jan 2026) | Confirmed via Cartesia/Deepgram plugin | Confirmed (benchmarked) | Not found in language list | Not confirmed |
| Hindi | Confirmed (Deepgram) | Confirmed | Confirmed | Confirmed | Confirmed via Cartesia/Deepgram plugin | Confirmed (benchmarked) | Confirmed | Not confirmed |
| Telugu | **Not confirmed** (Azure path unverifiable, off by default) | Confirmed | Confirmed | Confirmed (Jan 2026 — may already fix Vapi's gap) | Confirmed via Cartesia/Deepgram plugin | Confirmed (benchmarked) | Not found in language list | Not confirmed |
| Malayalam | **Not confirmed** (Azure path unverifiable, off by default) | Confirmed | Confirmed | **Not found in any list** | Confirmed via Cartesia plugin only | Claimed in "70+" but not benchmarked | Not found in language list | Not confirmed |
| Kannada | Confirmed (Deepgram) | Confirmed | Confirmed | Confirmed (Jan 2026) | Confirmed via Cartesia/Deepgram plugin | Claimed in "70+" but not benchmarked | Not found in language list | Not confirmed |

**Reading this table honestly:** ElevenLabs and Cartesia are the only two vendors in this research with unambiguous, named confirmation for all six languages. They are not equivalent offers, though — Cartesia is a TTS/STT component (would still need pairing with LiveKit, Daily/Pipecat, or a future Vapi-native Cartesia integration), while ElevenLabs Conversational AI is a full platform. Retell, on current public evidence, is a downgrade from Vapi's already-imperfect language coverage for this project. Deepgram's own gap has narrowed since the project's code comments were written and is worth re-checking before doing anything else.

---

## 4. What each alternative actually is (orchestration platform vs. component)

Grouping by the distinction the task called out:

- **Full orchestration platforms (Vapi-shaped — dashboard, call state, tool-calling, webhooks):** ElevenLabs Conversational AI, Retell AI, Hume AI EVI, LiveKit Agents (open-source/self-hostable), Daily Bots/Pipecat Cloud.
- **Components you'd assemble yourself:** Deepgram (Voice Agent API sits in between — bundled STT+LLM+TTS over one WebSocket, but no dashboard/telephony/call-archival layer), Cartesia (pure TTS/STT, explicitly meant to plug into something else), OpenAI Realtime API (a very capable single component — audio+LLM+tools in one model call — but no session/call-orchestration platform around it).

This distinction matters because "switch to Deepgram" or "switch to Cartesia" is not the same kind of decision as "switch to ElevenLabs" or "switch to Retell." The former means *this project's own team* takes on everything Vapi currently does around call lifecycle, recording archival, dashboard, and webhook routing (a lot of which — `SupabaseConversationRepository`, prompt assembly, tool execution — already exists in this codebase independent of Vapi, so the delta is smaller than it first appears, but it's still real). The latter is a like-for-like platform swap.

---

## 5. Recommendation

### (a) Is a full migration off Vapi justified right now?

**No.** Two independent reasons:

1. **The coupling that exists is coupling to undocumented vendor behavior discovered through production incidents, not to a clean interface.** Git history shows this project already burned real time discovering Vapi-specific quirks the hard way: `f98aad8` (webhook 401s traced to Vapi's inline-server-config-overrides-dashboard-secret behavior), `0b5bfa4` (live calls silently ran with no prompt/tools/webhook because Vapi's inline config defaults are unforgiving), and `cca35cf` (building a whole DOM-level loudness-enhancement workaround because Vapi's SDK has no volume control, plus reverse-engineering the exact call-lifecycle moment `setMuted()` becomes effective). Every one of these would need its equivalent rediscovered against a *different* vendor's undocumented internals. That's not a schema migration — it's redoing incident-driven discovery work, with the same category of production risk (webhook auth breaking, calls silently degrading) that already happened once.
2. **No concrete trigger currently justifies that risk.** Nothing in the code or this research points to Vapi being unreliable, prohibitively priced, or blocking a needed capability today. The one real, evidenced gap — Telugu/Malayalam transcription — is narrow, and (per §3) may be closer to a config/vendor-flag fix than a platform migration.

Migration should be revisited only if a concrete trigger shows up: Vapi cost becomes a real problem at scale, Vapi confirms it will never close the Malayalam/Telugu gap, or a reliability incident traces back to Vapi itself rather than this app's integration of it.

### (b) Is a thin abstraction layer worth building now?

**Partially, and only the part that's already half-built.** Don't build a general `VoiceOrchestrationProvider` interface today — with only one real implementation (Vapi) to abstract over, that interface would be a guess, and the parts of this codebase that already practice this discipline (see `resolveVoiceProviderConfig`'s own comments: "nothing asked for per-company provider choice," reads `process.env` per-call specifically so tests don't need module resets) show the team already avoids speculative abstraction on purpose. That instinct is correct here too.

What *is* already the right seam, and worth keeping clean rather than letting erode:
- `resolveVoiceProviderConfig` (`src/shared/lib/voice.ts`) and `resolveTranscriberConfig` (`src/features/language/server.ts`) — both already return small vendor-neutral tuples (`{provider, voiceId, model}`, `{provider, language}`). Vapi-shaped translation of these values happens at exactly two call sites (`useVapiSession.ts` around the `voice:`/`transcriber:` object construction, and the equivalent block in `route.ts`'s `assistant-request` handler) — keep it that way; resist the temptation to let Vapi's field names creep upstream of these functions.
- `ToolRegistry.getAllToolDefinitions()`'s OpenAI-function-call-shaped output — no change needed; it already happens to be reusable, as-is or with light reshaping, by OpenAI Realtime, LiveKit, ElevenLabs, and Hume (when Hume is configured with a GPT/Claude/Gemini backing model).

One small, low-risk hygiene fix worth doing regardless of any migration decision: the voice/transcriber-to-Vapi-shape translation is currently duplicated between `useVapiSession.ts` (~lines 430–445) and `route.ts`'s `assistant-request` handler (~lines 174–182). Collapsing that into one shared `toVapiAssistantVoiceConfig(...)`-style helper would remove the duplication that already exists today — independent of whether a second provider is ever added.

The client-side call-lifecycle state machine (`voiceState` transitions, the intro mic-mute gate, the loudness-enhancement hook, the reconnect timer) should **not** be abstracted yet. It's built entirely around Vapi's specific event timing, and other platforms' event models don't map onto it cleanly — e.g., some (OpenAI Realtime's `response.audio.done`-style events, some ElevenLabs SDK events) may not even need the 3-second "assistant finished speaking" approximation this hook currently relies on, meaning generalizing today's workaround would encode the wrong shape into an interface. Design that interface later, from a second real implementation, not from a guess.

### (c) Which single alternative is worth prototyping first?

**ElevenLabs Conversational AI**, for four concrete reasons:

1. It is the only full-orchestration alternative in this comparison with explicit, named, vendor-confirmed support for all six of this project's target languages — including Telugu and Malayalam, the exact two languages this project's current Vapi integration cannot confirm.
2. Lowest activation cost of any option here: this app already has a live, working ElevenLabs relationship in production (`resolveVoiceProviderConfig`'s `"11labs"` branch, gated by `VOICE_ELEVENLABS_VOICE_ID`, is real shipped code, not hypothetical) — an account, API credentials, and trust in their voice quality already exist. Prototyping their Conversational AI product extends a vendor relationship that's already there.
3. Its tool model (client tools + server-tools-as-webhooks, optionally JSON or form-encoded) is the closest conceptual match in this entire comparison to this app's existing `tool-calls` webhook handler — meaning `ToolRegistry` and the webhook-routing logic would need the least conceptual rework of any alternative to test against, keeping a prototype cheap.
4. The one thing to deliberately stress-test before any real commitment: ElevenLabs' WebRTC client SDK is newer than Vapi's (live in JS/Swift; React Native and Android explicitly "coming shortly" as of this research) — a prototype should validate real browser call quality/reliability side by side with the current Vapi implementation, and should not assume mobile-app-equivalent maturity if that's on this project's roadmap.

**A cheaper, narrower thing worth doing before or alongside that prototype:** check whether Vapi's current Deepgram transcriber integration has already picked up Nova-3's January 2026 Tamil/Telugu/Kannada expansion. If so, the Telugu gap this project's own code comments describe may already be fixable today with zero vendor change — worth five minutes of verification against Vapi's dashboard/docs before spending prototype effort solving a problem that might already be solved.

---

## Sources

- [OpenAI Realtime API Pricing 2026: Cost Per Minute Math](https://www.layer3labs.io/guides/openai-realtime-api-pricing)
- [Pricing | OpenAI API](https://developers.openai.com/api/docs/pricing)
- [Advancing voice intelligence with new models in the API | OpenAI](https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/)
- [Realtime API for Live Transcription: Features, Workflow & Alternatives - Reverie](https://reverieinc.com/blog/realtime-audio-transcription-api-guide/)
- [OpenAI expands API with GPT-Realtime-2, translation and speech-to-text models](https://bestmediainfo.com/mediainfo/mediainfo-digital/openai-expands-api-with-gpt-realtime-2-translation-and-speech-to-text-models-11813861)
- [Introduction | LiveKit Documentation](https://docs.livekit.io/agents/)
- [LiveKit Pricing 2026 — Full Breakdown + Best Alternative](https://trtc.io/blog/details/livekit-pricing-2026)
- [LiveKit Pricing 2026: Plans, Costs & Real Examples](https://checkthat.ai/brands/livekit/pricing)
- [Pricing - Daily.co](https://www.daily.co/pricing/)
- [Pricing - Daily Bots](https://www.daily.co/pricing/daily-bots/)
- [Daily and Vapi partner to deliver AI Voice Assistants as an API](https://www.daily.co/blog/daily-and-vapi-partner-to-deliver-ai-voice-assistants-as-an-api/)
- [Human-Quality Voice AI for Indian Languages - ElevenLabs](https://elevenlabs.io/india)
- [ElevenLabs — We cut our pricing for Conversational AI](https://elevenlabs.io/blog/we-cut-our-pricing-for-conversational-ai)
- [ElevenLabs Conversational AI now supports WebRTC](https://elevenlabs.io/blog/conversational-ai-webrtc)
- [Tools | ElevenLabs Documentation](https://elevenlabs.io/docs/conversational-ai/customization/tools)
- [Webhook tools | ElevenLabs Documentation](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools)
- [ElevenAPI Pricing](https://elevenlabs.io/pricing/api)
- [Retell AI Supported Languages 2026](https://www.retellai.com/blog/how-to-use-ai-phone-agents-for-multilingual-communication)
- [Retell AI Pricing per Minute: What You Actually Pay in 2026](https://www.cekura.ai/blogs/retell-ai-pricing-per-minute)
- [Retell AI Pricing 2026: Per-Minute Costs, Fees & Alternatives](https://www.cloudtalk.io/retell-ai-pricing/)
- [Nova-3 Adds 12 New Speech-to-Text Languages | Deepgram](https://deepgram.com/learn/nova-3-adds-12-new-languages-across-europe-and-south-asia)
- [Deepgram's Nova-3 Expands Speech-to-Text Support Across Asia-Pacific](https://deepgram.com/learn/deepgram-nova-3-expands-speech-to-text-support-across-asia-pacific)
- [Deepgram Pricing 2026: Aura-2 TTS + Voice Agent API Costs](https://texttolab.com/blog/deepgram-pricing)
- [Languages Support | Deepgram's Docs](https://developers.deepgram.com/docs/language)
- [Tool Use | Hume API](https://dev.hume.ai/docs/speech-to-speech-evi/features/tool-use)
- [Webhooks | Hume API](https://dev.hume.ai/docs/speech-to-speech-evi/configuration/webhooks)
- [Hume AI Pricing for Emotion-Aware Voice Apps](https://www.aipedia.wiki/guides/hume-ai-pricing-for-emotion-aware-voice-apps/)
- [Cartesia | Multilingual voice AI for a global presence](https://www.cartesia.ai/languages)
- [Cartesia | Ink](https://www.cartesia.ai/ink)
- [Cartesia Sonic 3 pricing: Plans, costs, and limits (2026)](https://www.eesel.ai/blog/cartesia-sonic-3-pricing)
- [Cartesia's Ink-Whisper is Now Live on Vapi - Vapi AI Blog](https://vapi.ai/blog/cartesia-s-ink-whisper-is-now-live-on-vapi)

**Codebase references (this repository):**
- `src/features/voice/hooks/useVapiSession.ts`
- `src/app/api/vapi/webhook/route.ts`
- `src/core/application/tools/ToolRegistry.ts`
- `src/shared/lib/voice.ts`
- `src/features/language/config.ts`, `src/features/language/server.ts`
- `src/core/infrastructure/bootstrap/assistantRuntime.ts`
- `src/features/voice/lib/audioEnhancement.ts`
- Git history: commits `f98aad8`, `0b5bfa4`, `cca35cf`
