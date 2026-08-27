import {
  QUALIFICATION_QUESTIONS,
  QUALIFICATION_QUESTIONS_TA,
  getAnswerGuidance,
  getContinuePrompt,
  getQualificationCallOpening,
  withAnswerGuidance,
} from "@/features/voice/lib/qualificationScript";
import { allQualificationUtterances, qualificationUtterances } from "@/features/voice/lib/qualificationAudio";
import {
  isProviderConfigured,
  resolveProviderChain,
  ttsCacheKey,
  ttsCachePath,
} from "@/shared/lib/tts/ttsBackends";

/**
 * The recorded qualification voice.
 *
 * The six questions are spoken on every call and were being rendered live by
 * whatever provider Vapi happened to use, which is why they sounded like a
 * different person from the recorded introduction and pitches. They are now
 * pre-rendered through the same server-side pipeline and served from the same
 * durable cache.
 *
 * What these pin is the part that silently rots: the set of utterances, the
 * exact text (the cache is keyed on it, so a paraphrase orphans the audio),
 * and the cache identity that keeps two languages and two providers apart.
 */

describe("the fixed utterances that get pre-recorded", () => {
  it("covers all six questions plus the closing prompt, in both languages", () => {
    for (const language of ["en", "ta"] as const) {
      const ids = qualificationUtterances(language).map((u) => u.id);
      expect(ids).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "continue", "reprompt"]);
    }
    expect(allQualificationUtterances()).toHaveLength(16);
  });

  it("speaks the authored English questions verbatim, with the closed-answer guidance", () => {
    const utterances = qualificationUtterances("en");
    QUALIFICATION_QUESTIONS.forEach((q, i) => {
      expect(utterances[i].text).toBe(withAnswerGuidance(q.question, getAnswerGuidance("en")));
      expect(utterances[i].text).toContain(q.question);
    });
  });

  it("speaks the authored Tamil questions verbatim, with the Tamil guidance", () => {
    const utterances = qualificationUtterances("ta");
    QUALIFICATION_QUESTIONS_TA.forEach((q, i) => {
      expect(utterances[i].text).toBe(withAnswerGuidance(q.question, getAnswerGuidance("ta")));
    });
  });

  it("carries the existing continue prompt, not a new one", () => {
    expect(qualificationUtterances("en").find((u) => u.id === "continue")?.text).toBe(getContinuePrompt("en"));
    expect(qualificationUtterances("ta").find((u) => u.id === "continue")?.text).toBe(getContinuePrompt("ta"));
  });

  it("stops at six questions — no seventh, and no revival of the old long script", () => {
    const questionIds = qualificationUtterances("en").filter((u) => /^q\d+$/.test(u.id));
    expect(questionIds).toHaveLength(6);
    expect(qualificationUtterances("en").some((u) => u.id === "q7")).toBe(false);
  });

  it("never mixes the two languages' text", () => {
    const tamil = /[஀-௿]/;
    expect(qualificationUtterances("ta").every((u) => tamil.test(u.text))).toBe(true);
    expect(qualificationUtterances("en").some((u) => tamil.test(u.text))).toBe(false);
  });
});

describe("Q1 is spoken once", () => {
  it("the call's opening IS the recorded Q1, so no second copy can exist", () => {
    // Q1 reaches TTS as the call's firstMessage; Q2-Q6 arrive as the tool's
    // `speak`. Both compose the same string, so one asset serves whichever
    // path speaks it — and there is no branch where both do.
    for (const language of ["en", "ta"] as const) {
      const q1 = qualificationUtterances(language).find((u) => u.id === "q1");
      expect(q1?.text).toBe(getQualificationCallOpening(language));
    }
  });
});

describe("cache identity", () => {
  const RATE = 24000;
  const sample = qualificationUtterances("en")[0].text;

  it("puts English and Tamil assets on different paths", () => {
    const en = ttsCachePath("gemini", "en", RATE, sample);
    const ta = ttsCachePath("gemini", "ta", RATE, sample);
    expect(en).not.toBe(ta);
    expect(en).toContain("/en/");
    expect(ta).toContain("/ta/");
  });

  it("separates providers, so one provider's audio is never served as another's", () => {
    expect(ttsCacheKey("gemini", "en", RATE, sample)).not.toBe(ttsCacheKey("openai", "en", RATE, sample));
  });

  it("separates sample rates", () => {
    expect(ttsCacheKey("gemini", "en", 24000, sample)).not.toBe(ttsCacheKey("gemini", "en", 16000, sample));
  });

  it("changes when the question wording changes, orphaning the old recording", () => {
    const edited = `${sample} And one more thing.`;
    expect(ttsCacheKey("gemini", "en", RATE, edited)).not.toBe(ttsCacheKey("gemini", "en", RATE, sample));
  });

  it("is stable for the same inputs, which is what makes a warmed asset findable", () => {
    expect(ttsCachePath("gemini", "ta", RATE, sample)).toBe(ttsCachePath("gemini", "ta", RATE, sample));
  });
});

describe("provider chain", () => {
  const ORIGINAL = process.env;

  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("offers Gemini for English, not OpenAI alone", () => {
    // English used to be OpenAI-only, so English audio died with that key.
    expect(resolveProviderChain("en")).toContain("gemini");
    expect(resolveProviderChain("ta")).toContain("gemini");
  });

  it("keeps OpenAI available as a fallback rather than removing it", () => {
    expect(resolveProviderChain("en")).toContain("openai");
  });

  it("treats a provider with no credential as unusable, so it is never tried", () => {
    process.env = { ...ORIGINAL, GEMINI_API_KEY: "", OPENAI_API_KEY: "your-openai-key-here", CUSTOM_TTS_URL: "", CUSTOM_TTS_API_KEY: "" };
    expect(isProviderConfigured("gemini")).toBe(false);
    expect(isProviderConfigured("openai")).toBe(false);
    expect(isProviderConfigured("custom")).toBe(false);
  });

  it("treats a real credential as usable", () => {
    process.env = { ...ORIGINAL, GEMINI_API_KEY: "AIzaSyRealLookingKeyValue" };
    expect(isProviderConfigured("gemini")).toBe(true);
  });
});
