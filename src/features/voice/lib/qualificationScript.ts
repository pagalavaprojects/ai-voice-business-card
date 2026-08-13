/**
 * THE single authoritative qualification questionnaire (2026-08-13 revision
 * — product-owner final decision, replaces the earlier 17-question Tamil/
 * English dual script). Exactly six questions, English only, immutable
 * wording. Every qualification channel (voice, WhatsApp) and every UI
 * surface that displays qualification history derives from this one list —
 * there is no second copy anywhere and no language dispatch: the visitor's
 * chosen card/pitch language has no effect on this script.
 */
export interface AuthoredQuestion {
  readonly number: number;
  readonly question: string;
}

export const QUALIFICATION_QUESTIONS: readonly AuthoredQuestion[] = [
  { number: 1, question: "Is our service or product something you need immediately?" },
  { number: 2, question: "Have you set aside a specific budget for this already?" },
  { number: 3, question: "Do you believe our service or product will be useful for your business?" },
  { number: 4, question: "Is there anything holding you back — for example, price or timing?" },
  { number: 5, question: "Are you ready to decide today?" },
  { number: 6, question: "Shall I show you our calendar now, so we can book a convenient time to move this forward?" },
] as const;

export function getAuthoredQuestion(number: number): AuthoredQuestion | null {
  return QUALIFICATION_QUESTIONS.find((q) => q.number === number) ?? null;
}

/** The mandatory closed-answer guidance, spoken after EVERY question: the
 * visitor must answer with exactly Yes, No or Maybe — the questionnaire is
 * closed-ended, never an open conversation. Authored wording; tests pin it. */
export const QUALIFICATION_ANSWER_GUIDANCE = "Please answer with Yes, No, or Maybe.";

/** A question as actually spoken: the authored text followed by the
 * closed-answer guidance. */
export function withAnswerGuidance(question: string, guidance: string = QUALIFICATION_ANSWER_GUIDANCE): string {
  return `${question}\n\n${guidance}`;
}

/**
 * The qualification call's ACTUAL opening: EXACTLY Question 1 followed by
 * the closed-answer guidance. No greeting, no preamble, no generic
 * assistant opener ("How can I help you?" or similar) — the first spoken
 * content after "Start AI Conversation" IS Q1, and the directive tells the
 * AI the opening already asked Q1 (never repeat it; the visitor's first
 * reply is Q1's answer).
 */
export const QUALIFICATION_CALL_OPENING = withAnswerGuidance(QUALIFICATION_QUESTIONS[0].question);

/** Every authored question, in asking order — the UI's authoritative
 * source for "which question is on screen right now". */
export const ALL_QUESTIONS: readonly string[] = QUALIFICATION_QUESTIONS.map((q) => q.question);

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

export function classifyClosedResponse(raw: string): "YES" | "NO" | "MAYBE" | null {
  const tokens = raw
    .toLowerCase()
    .replace(/[?？.!,;:"'“”‘’()\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  let result: "YES" | "NO" | "MAYBE" | null = null;
  for (const token of tokens) {
    const cls = CLOSED_ANSWER_TOKENS[token];
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
export function matchAuthoredQuestion(transcript: string): string | null {
  const norm = (s: string) => normalize(s.toLowerCase());
  const guidance = norm(QUALIFICATION_ANSWER_GUIDANCE);
  const t = norm(transcript).split(guidance).join(" ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const q of ALL_QUESTIONS) {
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

/** Spoken verbatim as the assistant's final words, but ONLY when
 * book_appointment reports a genuinely confirmed booking (a real Cal.com
 * event exists) — never on a REQUESTED/unconfirmed fallback, and never
 * elsewhere. Exact approved wording, product-owner authorized. */
export const APPOINTMENT_CONFIRMED_CLOSING = "Thank You for Your Valuable Time and Support. Have a Wonderful Day";

/**
 * The system-prompt section injected for a qualification call. Progression
 * is enforced entirely server-side by get_next_qualification_question —
 * this text tells the model its contract with that tool. Explicitly
 * forbids the AI from falling back into a generic assistant opener: the
 * qualification flow is proactive and directive, never "How can I help
 * you?".
 */
export function getQualificationDirective(): string {
  const numbered = QUALIFICATION_QUESTIONS.map((q) => `${q.number}. ${q.question}`).join("\n");
  return (
    `

=== QUALIFICATION SCRIPT (booking flow) ===
` +
    `This is a STRICT CLOSED-ENDED questionnaire, not a conversation. Ask ONLY the authored questions below, one ` +
    `at a time, EXACTLY as written — never translate, paraphrase, shorten, reword or renumber them, and never ` +
    `invent a question. ` +
    `After EVERY question you must say exactly: "${QUALIFICATION_ANSWER_GUIDANCE}" — the visitor may only answer ` +
    `Yes, No, or Maybe. Never ask for explanations or open-ended answers. ` +
    `The call's opening ALREADY asked question 1 plus that guidance — do NOT repeat it and do NOT add any ` +
    `greeting or preamble; the visitor's first reply is the answer to question 1. Never replay the founder pitch ` +
    `or any elevator/product/USP content during qualification. ` +
    `NEVER greet the visitor with a generic assistant opener such as "How can I help you?", "How may I help you?", ` +
    `"What can I help you with?", "How can I assist you?", "How may I assist you today?" or any equivalent — even ` +
    `if the visitor's first message is only "Hi" or similarly open-ended, proceed directly with the qualification ` +
    `question sequence, never with an open-ended offer to help.
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
    `complete — say EXACTLY: "${QUALIFICATION_CONTINUE_PROMPT}" (never paraphrase this — not "click continue", not ` +
    `"continue to schedule", exactly this phrase) so they know to use the on-screen Continue button, which is ` +
    `already visible. Never claim the appointment is booked yet — the visitor still has to pick a time and enter ` +
    `their details on screen. Only if they explicitly ask to book entirely by voice instead should you collect ` +
    `Name/Email/Phone and use book_appointment.
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
