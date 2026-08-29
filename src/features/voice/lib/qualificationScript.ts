/**
 * THE single authoritative qualification questionnaire (2026-08-19
 * revision — product-owner decision: the SAME six questions, now
 * language-aware). ONE engine, exactly six questions, immutable wording
 * per language, strict server-side closed-answer classification. The
 * qualification language follows the visitor's selected card language for
 * the two authored languages (English and Tamil); every other card
 * language uses English. This deliberately supersedes the 2026-08-13
 * "English only" rule — but NOT the rest of that decision: there is still
 * no Q7+, no 17-question flow, no HOT/WARM/COLD gate, and no second
 * sequencing engine. Persisted answers remain canonical English
 * Yes/No/Maybe regardless of the spoken language, so qualification-status,
 * the dashboard funnel, and WhatsApp (which stays English) all read one
 * record format.
 */
export interface AuthoredQuestion {
  readonly number: number;
  readonly question: string;
}

export type QualificationLanguage = "en" | "ta";

/** Maps any card language to a qualification language: only English and
 * Tamil have authored question sets; everything else qualifies in English. */
export function toQualificationLanguage(cardLanguage: string | null | undefined): QualificationLanguage {
  return cardLanguage === "ta" ? "ta" : "en";
}

export const QUALIFICATION_QUESTIONS: readonly AuthoredQuestion[] = [
  { number: 1, question: "Is our service or product something you need immediately?" },
  { number: 2, question: "Have you set aside a specific budget for this already?" },
  { number: 3, question: "Do you believe our service or product will be useful for your business?" },
  { number: 4, question: "Is there anything holding you back — for example, price or timing?" },
  { number: 5, question: "Are you ready to decide today?" },
  { number: 6, question: "Shall I show you our calendar now, so we can book a convenient time to move this forward?" },
] as const;

/** The SAME six questions in natural spoken business Tamil — authored
 * translations preserving the exact meaning of the English set (the
 * historical 17-question Tamil script was open-ended and is deliberately
 * NOT reused). Closed-ended, concise for voice, உங்கள்-register matching
 * the approved MaylaanAI Tamil pitch content. Never machine-translated at
 * runtime; this list is the one canonical Tamil source. */
export const QUALIFICATION_QUESTIONS_TA: readonly AuthoredQuestion[] = [
  { number: 1, question: "எங்கள் சேவை அல்லது தயாரிப்பு உங்களுக்கு உடனடியாகத் தேவைப்படுகிறதா?" },
  { number: 2, question: "இதற்காக ஒரு குறிப்பிட்ட பட்ஜெட்டை ஏற்கனவே ஒதுக்கி வைத்துள்ளீர்களா?" },
  { number: 3, question: "எங்கள் சேவை அல்லது தயாரிப்பு உங்கள் வணிகத்திற்குப் பயனுள்ளதாக இருக்கும் என்று நம்புகிறீர்களா?" },
  { number: 4, question: "உங்களைத் தயங்க வைக்கும் ஏதேனும் இருக்கிறதா — உதாரணமாக, விலை அல்லது நேரம்?" },
  { number: 5, question: "இன்றே முடிவெடுக்கத் தயாராக இருக்கிறீர்களா?" },
  { number: 6, question: "இதை முன்னெடுக்க வசதியான நேரத்தைப் பதிவு செய்ய, இப்போது எங்கள் காலெண்டரைக் காட்டட்டுமா?" },
] as const;

export function getQualificationQuestions(language: QualificationLanguage = "en"): readonly AuthoredQuestion[] {
  return language === "ta" ? QUALIFICATION_QUESTIONS_TA : QUALIFICATION_QUESTIONS;
}

export function getAuthoredQuestion(number: number, language: QualificationLanguage = "en"): AuthoredQuestion | null {
  return getQualificationQuestions(language).find((q) => q.number === number) ?? null;
}

/** The mandatory closed-answer guidance, spoken after EVERY question: the
 * visitor must answer with exactly Yes, No or Maybe — the questionnaire is
 * closed-ended, never an open conversation. Authored wording; tests pin it. */
export const QUALIFICATION_ANSWER_GUIDANCE = "Please answer with Yes, No, or Maybe.";

/** The Tamil closed-answer guidance — the accepted spoken answers are
 * ஆம் (Yes), இல்லை (No), இருந்தாலும் (Maybe), per the product decision. */
export const QUALIFICATION_ANSWER_GUIDANCE_TA = "தயவுசெய்து ஆம், இல்லை அல்லது இருந்தாலும் என்று மட்டும் பதில் சொல்லுங்கள்.";

export function getAnswerGuidance(language: QualificationLanguage = "en"): string {
  return language === "ta" ? QUALIFICATION_ANSWER_GUIDANCE_TA : QUALIFICATION_ANSWER_GUIDANCE;
}

/** A question as actually spoken: the authored text followed by the
 * closed-answer guidance. */
export function withAnswerGuidance(question: string, guidance: string = QUALIFICATION_ANSWER_GUIDANCE): string {
  return `${question}\n\n${guidance}`;
}

/**
 * The qualification call's ACTUAL opening: EXACTLY Question 1 followed by
 * the closed-answer guidance, in the qualification language. No greeting,
 * no preamble, no generic assistant opener ("How can I help you?" or
 * similar) — the first spoken content after "Start AI Conversation" IS Q1,
 * and the directive tells the AI the opening already asked Q1 (never
 * repeat it; the visitor's first reply is Q1's answer).
 */
export const QUALIFICATION_CALL_OPENING = withAnswerGuidance(QUALIFICATION_QUESTIONS[0].question);

export function getQualificationCallOpening(language: QualificationLanguage = "en"): string {
  const questions = getQualificationQuestions(language);
  return withAnswerGuidance(questions[0].question, getAnswerGuidance(language));
}

/** Every authored question, in asking order — the UI's authoritative
 * source for "which question is on screen right now". */
export const ALL_QUESTIONS: readonly string[] = QUALIFICATION_QUESTIONS.map((q) => q.question);

export function getAllQuestions(language: QualificationLanguage = "en"): readonly string[] {
  return getQualificationQuestions(language).map((q) => q.question);
}

/**
 * Strict closed-ended classification of the visitor's RAW response. Accepts
 * ONLY yes/no/maybe (with common casual variants) — possibly repeated
 * ("yes yes") — and returns null for anything else, including sentences
 * that merely CONTAIN a permitted word ("yes we have a problem"), fillers,
 * and don't-know answers. null means: do NOT advance, do NOT store —
 * re-speak the guidance and listen again. This runs SERVER-side (the
 * sequencing tool); the model is never trusted to classify. Case-
 * insensitive (STT casing is inconsistent).
 */
const CLOSED_ANSWER_TOKENS: Record<string, "YES" | "NO" | "MAYBE"> = {
  yes: "YES",
  yeah: "YES",
  yep: "YES",
  yup: "YES",
  no: "NO",
  nope: "NO",
  nah: "NO",
  maybe: "MAYBE",
};

/** Tamil closed-answer tokens: the three product-mandated answers plus the
 * standard colloquial/ASR variants of them (ஆமாம்/ஆமா for ஆம்; இல்ல for
 * இல்லை) — and nothing else. "சரி", "okay", "yes", "எனக்கு தெரியவில்லை"
 * and any free-form Tamil are deliberately NOT accepted in Tamil mode:
 * the guidance line tells the visitor exactly which words classify, the
 * same closed-ended contract as English. */
const CLOSED_ANSWER_TOKENS_TA: Record<string, "YES" | "NO" | "MAYBE"> = {
  "ஆம்": "YES",
  "ஆமாம்": "YES",
  "ஆமா": "YES",
  "இல்லை": "NO",
  "இல்ல": "NO",
  "இருந்தாலும்": "MAYBE",
};

/**
 * The three answers a visitor may tap instead of speaking.
 *
 * The label IS the word sent into the conversation, so these are not display
 * strings that happen to look right — each one is a token
 * classifyClosedResponse already accepts, in that language. Anything else
 * would classify as null and silently reprompt, which is exactly the failure
 * a tappable button is supposed to remove.
 *
 * The classification is still decided SERVER-side from the sent text, the
 * same as a spoken answer: `classification` here is only what the UI shows
 * back to the visitor, never what gets stored.
 */
export interface QuickReplyOption {
  /** What the button reads, and what is sent as the answer. */
  label: string;
  classification: "YES" | "NO" | "MAYBE";
}

const QUICK_REPLIES_EN: readonly QuickReplyOption[] = [
  { label: "Yes", classification: "YES" },
  { label: "No", classification: "NO" },
  { label: "Maybe", classification: "MAYBE" },
] as const;

const QUICK_REPLIES_TA: readonly QuickReplyOption[] = [
  { label: "ஆம்", classification: "YES" },
  { label: "இல்லை", classification: "NO" },
  { label: "இருந்தாலும்", classification: "MAYBE" },
] as const;

export function getQuickReplyOptions(language: QualificationLanguage = "en"): readonly QuickReplyOption[] {
  return language === "ta" ? QUICK_REPLIES_TA : QUICK_REPLIES_EN;
}

export function classifyClosedResponse(raw: string, language: QualificationLanguage = "en"): "YES" | "NO" | "MAYBE" | null {
  const tokenMap = language === "ta" ? CLOSED_ANSWER_TOKENS_TA : CLOSED_ANSWER_TOKENS;
  const tokens = raw
    .toLowerCase()
    .replace(/[?？.!,;:"'“”‘’()\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  let result: "YES" | "NO" | "MAYBE" | null = null;
  for (const token of tokens) {
    const cls = tokenMap[token];
    // Any non-permitted token — or a mix of classes — invalidates the
    // whole utterance: closed-ended means the answer IS the word.
    if (!cls || (result !== null && cls !== result)) return null;
    result = cls;
  }
  return result;
}

const normalize = (s: string) => s.replace(/[?？.!,]/g, "").replace(/\s+/g, " ").trim();

/**
 * Matches a live assistant transcript against the authored question list
 * and returns the EXACT authored wording (never the transcript's own
 * rendering of it) — the UI must always display the authoritative text,
 * not an ASR/TTS-roundtripped paraphrase. Tolerant of punctuation and
 * whitespace drift, and of the closed-answer guidance that is spoken after
 * every question; null when the utterance isn't one of the authored
 * questions.
 */
export function matchAuthoredQuestion(transcript: string, language: QualificationLanguage = "en"): string | null {
  const norm = (s: string) => normalize(s.toLowerCase());
  const guidance = norm(getAnswerGuidance(language));
  const t = norm(transcript).split(guidance).join(" ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const q of getAllQuestions(language)) {
    const nq = norm(q);
    if (t.includes(nq) || nq.includes(t)) return q;
  }
  return null;
}

/** Spoken verbatim once qualification completes (action
 * "complete_proceed_to_booking"), inviting the visitor to use the on-screen
 * Continue button — exact approved wording, product-owner authorized. Never
 * paraphrase ("Click continue", "Continue to schedule", etc.). */
export const QUALIFICATION_CONTINUE_PROMPT = "Please Click to Continue";

/** The Tamil completion prompt — same meaning, spoken in the session's
 * language ("Continue" stays as the literal on-screen button label). */
export const QUALIFICATION_CONTINUE_PROMPT_TA = "தொடர்வதற்கு, திரையில் உள்ள Continue பொத்தானை அழுத்துங்கள்.";

export function getContinuePrompt(language: QualificationLanguage = "en"): string {
  return language === "ta" ? QUALIFICATION_CONTINUE_PROMPT_TA : QUALIFICATION_CONTINUE_PROMPT;
}

/** Spoken verbatim as the assistant's final words, but ONLY when
 * book_appointment reports a genuinely confirmed booking (a real Cal.com
 * event exists) — never on a REQUESTED/unconfirmed fallback, and never
 * elsewhere. Exact approved wording, product-owner authorized. */
export const APPOINTMENT_CONFIRMED_CLOSING = "Thank You for Your Valuable Time and Support. Have a Wonderful Day";

/** The COMPLETE confirmed-booking closing speech — headline, the approved
 * thank-you line, and the actually-booked slot. Both confirmation paths
 * (the live voice call's book_appointment tool and the booking modal's
 * Done step) speak this same builder's output, so the spoken confirmation
 * can never drift between channels. `when` must be the REAL selected
 * slot, already formatted for the visitor (e.g. "Mon, Aug 17, 9:00 AM"). */
export function buildAppointmentConfirmedSpeech(when: string): string {
  return `Appointment Confirmed!\n\n${APPOINTMENT_CONFIRMED_CLOSING}\n\nPreferred time: ${when}`;
}

/**
 * The system-prompt section injected for a qualification call. Progression
 * is enforced entirely server-side by get_next_qualification_question —
 * this text tells the model its contract with that tool. Explicitly
 * forbids the AI from falling back into a generic assistant opener: the
 * qualification flow is proactive and directive, never "How can I help
 * you?".
 */
export function getQualificationDirective(language: QualificationLanguage = "en"): string {
  const questions = getQualificationQuestions(language);
  const guidance = getAnswerGuidance(language);
  const continuePrompt = getContinuePrompt(language);
  const numbered = questions.map((q) => `${q.number}. ${q.question}`).join("\n");
  const languageRule =
    language === "ta"
      ? `This section OVERRIDES any "RESPONSE LANGUAGE" instruction elsewhere in this prompt for as long as ` +
        `qualification is active: every word you speak from here on — the authored questions, the answer ` +
        `guidance, reprompts, and the completion line — is TAMIL ONLY, exactly as authored below. Never ` +
        `translate the authored Tamil questions into English or any other language, never paraphrase them, and ` +
        `never switch to English unless the visitor explicitly asks you to. `
      : `This section OVERRIDES any "RESPONSE LANGUAGE" instruction elsewhere in this prompt for as long as ` +
        `qualification is active: every word you speak from here on — the authored questions, the Yes/No/Maybe ` +
        `guidance, reprompts, and the completion line — is English ONLY, even if the visitor's chosen card language ` +
        `is Hindi, Telugu, Malayalam or Kannada and even if the visitor speaks to you in that language. `;
  const acceptedAnswers = language === "ta" ? "ஆம், இல்லை, அல்லது இருந்தாலும்" : "Yes, No, or Maybe";
  return (
    `

=== QUALIFICATION SCRIPT (booking flow) ===
` +
    languageRule +
    `This is a STRICT CLOSED-ENDED questionnaire, not a conversation. Ask ONLY the authored questions below, one ` +
    `at a time, EXACTLY as written — never translate, paraphrase, shorten, reword or renumber them, and never ` +
    `invent a question. ` +
    `After EVERY question you must say exactly: "${guidance}" — the visitor may only answer ` +
    `${acceptedAnswers}. Never ask for explanations or open-ended answers, and never answer the questions yourself. ` +
    `The call's opening ALREADY asked question 1 plus that guidance — do NOT repeat it and do NOT add any ` +
    `greeting or preamble; the visitor's first reply is the answer to question 1. Never replay the founder pitch ` +
    `or any elevator/product/USP content during qualification. ` +
    `NEVER greet the visitor with a generic assistant opener such as "How can I help you?", "How may I help you?", ` +
    `"What can I help you with?", "How can I assist you?", "How may I assist you today?" or any equivalent — even ` +
    `if the visitor's first message is only "Hi" or similarly open-ended, proceed directly with the qualification ` +
    `question sequence, never with an open-ended offer to help.
` +
    `SAY NOTHING WHILE THE TOOL IS RUNNING. Between the visitor's reply and the tool's answer you are SILENT — ` +
    `you do not acknowledge, stall, narrate or think out loud. Never say "one moment", "just a moment", "give me ` +
    `a moment", "please wait", "hold on", "let me check", "let me see", "bear with me", "processing", "okay", ` +
    `"got it", "thank you", "alright" or ANY equivalent filler, in ANY language, at ANY point in this ` +
    `questionnaire. If the tool takes a few seconds, the correct behaviour is silence, not conversation. ` +
    `The ONLY words you may ever speak during qualification are: an authored question with its guidance line, the ` +
    `guidance line alone on a reprompt, and the completion line. Nothing else — no preamble before a question, no ` +
    `comment after an answer, no transition phrase between them.
` +
    `AFTER EVERY VISITOR REPLY you MUST:
` +
    `1. Call get_next_qualification_question with: last_answered_question (the number of the question they just ` +
    `replied to) and user_response (the visitor's words EXACTLY as you heard them — never cleaned up, never ` +
    `translated, never invented). You do NOT need a lead_id — the server resolves the lead for this call on its ` +
    `own; do not wait to call save_lead first.
` +
    `2. You do NOT classify and you do NOT judge validity — the SERVER decides whether the reply is YES, NO or ` +
    `MAYBE. If the server returns action "reprompt", the answer was not valid: SPEAK the returned text verbatim ` +
    `(the guidance line), stay on the SAME question, and listen again. Never advance past an unaccepted answer ` +
    `and never invent a classification.
` +
    `3. When the server returns the next question, SPEAK its "speak" text EXACTLY as returned (it already ends ` +
    `with the guidance line). Obey its action field: "complete_proceed_to_booking" means qualification is fully ` +
    `complete — say EXACTLY: "${continuePrompt}" (never paraphrase this, exactly this phrase) so they know to use ` +
    `the on-screen Continue button, which is already visible. Never claim the appointment is booked yet — the ` +
    `visitor still has to pick a time and enter their details on screen. Only if they explicitly ask to book ` +
    `entirely by voice instead should you collect Name/Email/Phone and use book_appointment.
` +
    `4. After an ACCEPTED answer you may also mirror it into the lead via update_lead_qualification (immediate ` +
    `need -> urgency and buying_intent; budget set aside -> budget; perceived usefulness -> notes; obstacles -> ` +
    `objections; ready to decide today -> buying_intent) using only the question asked and the server's accepted ` +
    `YES/NO/MAYBE — never invented content.

` +
    `If the visitor is silent: do NOT call the tool — repeat the guidance and listen again. The sequencing is ` +
    `decided entirely by the tool — never skip a question it returned and never ask one it did not return. The ` +
    `visitor may stop or skip to booking at ANY point — never trap them.

` +
    `THE AUTHORED QUESTIONS:
${numbered}`
  );
}
