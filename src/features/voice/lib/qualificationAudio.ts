import {
  QualificationLanguage,
  getAnswerGuidance,
  getContinuePrompt,
  getQualificationQuestions,
  withAnswerGuidance,
} from "@/features/voice/lib/qualificationScript";

/**
 * Every utterance the qualification flow speaks that is FIXED in advance.
 *
 * The six questions, the closing prompt and the reprompt guidance are the
 * same strings on every call, which is what makes them worth rendering once
 * and keeping. Everything else the assistant says is improvised and stays on
 * the live path.
 *
 * These are derived from the authored script rather than copied, so the
 * spoken text and the pre-rendered audio cannot drift apart: change a
 * question and its cache identity changes with it (the text is hashed into
 * the key), so the old recording is simply never looked up again.
 *
 * The strings must match what actually reaches the TTS endpoint EXACTLY —
 * the cache is keyed on the text — so they are built with the same
 * withAnswerGuidance() the tool and the call opening use.
 */

export interface QualificationUtterance {
  /** Stable identifier for reporting and tests: q1…q6, continue, reprompt. */
  id: string;
  language: QualificationLanguage;
  /** The exact text Vapi will ask the TTS endpoint to speak. */
  text: string;
}

export const QUALIFICATION_AUDIO_LANGUAGES: readonly QualificationLanguage[] = ["en", "ta"] as const;

/** The utterances for one language, in the order the call speaks them. */
export function qualificationUtterances(language: QualificationLanguage): QualificationUtterance[] {
  const guidance = getAnswerGuidance(language);
  const questions = getQualificationQuestions(language).map((q) => ({
    id: `q${q.number}`,
    language,
    // Question 1 reaches TTS as the call's opening and questions 2-6 as the
    // tool's `speak` — both are this same composition, so one asset serves
    // whichever path speaks it.
    text: withAnswerGuidance(q.question, guidance),
  }));

  return [
    ...questions,
    { id: "continue", language, text: getContinuePrompt(language) },
    // Not one of the fourteen, but fixed and reachable on any unclassifiable
    // reply — pre-rendering it keeps a reprompt from stalling mid-call.
    { id: "reprompt", language, text: guidance },
  ];
}

/** Every fixed utterance across both languages. */
export function allQualificationUtterances(): QualificationUtterance[] {
  return QUALIFICATION_AUDIO_LANGUAGES.flatMap((language) => qualificationUtterances(language));
}
