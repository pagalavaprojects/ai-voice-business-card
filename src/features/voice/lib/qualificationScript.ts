/**
 * The founder-authored Tamil qualification content — supplied verbatim and
 * treated as source-of-truth, exactly like the authored Tamil elevator
 * pitch in pitchScripts.ts. Nothing here is translated, paraphrased,
 * shortened or grammar-"fixed"; tests pin the wording.
 *
 * These drive the REAL interactive qualification: the intro is spoken as
 * the qualification call's first message, and the question sets are
 * injected into the assistant's system prompt (Tamil sessions only) so the
 * live AI asks them in order — speak → listen → think → store — through
 * the existing save_lead / update_lead_qualification tools. No fake
 * questionnaire UI is involved.
 */

/**
 * The founder's authored Maylaan AI introduction — PITCH-experience
 * content, kept verbatim as supplied. It must NEVER be used as the
 * qualification call's opening (see TAMIL_QUALIFICATION_CALL_OPENING
 * below): replaying a ~90-second sales pitch after "Book an Appointment"
 * is exactly the behavior the product owner rejected.
 */
export const TAMIL_QUALIFICATION_INTRO = `வணக்கம், இந்த மாதம் எத்தனை பேர் உங்கள் Business Card ஐ கொடுத்திருப்பீங்க… ஆனால் திரும்பி ஒரு Call ம் வரவில்லையா?

அது உங்கள் தப்பு இல்லை — அந்த Paper Business Card ன் தவறு.

ஒரு Paper Card உங்கள் நம்பரை மட்டும்தான் கொடுக்கும். அது உங்கள் Business Pitch ஐ பண்ணாது. அவங்க ஒரு நல்ல Lead அ இல்லையான்னு தெரிஞ்சுக்காது. Appointment Book பண்ணாது. நீங்கள் மறுபடியும் அவர்களை கூப்பிடும் வரைக்கும், அவங்களுக்கு ஏன் அந்த Card ஐ வாங்கினோம்னே மறந்திருக்கும்.

இந்த பிரட்சனைக்கு, தீர்வு எங்களின் Maylaan AI இது ஒரு AI Voice Business Card. இந்த Card ஐ உங்கள் Lead ன் Mobile ல் Tap அல்லது QR ஸ்கேன் செய்தால் போதும். இந்த card உங்களுக்காக வேலை பார்க்கும். இது தானாக செய்யும்:

முதலில் உங்களோட Thirty Second Elevator Pitch Play ஆகும். பிறகு Product Pitch மற்றும் USP இணை AI குரலில் பேசும்.

அப்புறம் இது ஒரு பேப்பர் கார்டால் ஒரு நாளும் செய்ய முடியாத ஒரு வேலை செய்யும் — அது உங்கள் Leads கூட உரையாடும்.

அவர்களிடம் AI voice மூலமா பேசி — ஒரு உண்மையான Prospect அ இல்லையா என்றும், அவர்கள் Lead Conversion ஆயிருக்காங்கன்னும் கண்டுபிடிக்கும்.

அவங்க qualify ஆனா, உடனே Appointment Boom ஆகிடும் — அப்புறம் WhatsApp-ல உங்க ரெண்டு பேருக்கும் reminder message அனுப்பும், so no-show குறையும்.

அதனால நீங்க கார்டு குவியல வச்சு பின்னாடி ஓடிக்கிட்டு இருக்கிறதுக்கு பதிலா... நீங்க தூங்கி எழுந்திருக்கும்போதே உங்களுக்கு qualify ஆன, பேச ரெடியா இருக்குற Leads List கிடைச்சிருக்கும் — ஏற்கனவே உங்க Pitch அ கேட்டு, Meeting கு 'yes' சொல்லிட்டும்.

இது தான் இந்த card ன் சிறப்பு. நன்றி.`;

/**
 * THE single authoritative questionnaire (2026-08-10 revision, supplied by
 * the product owner — immutable wording). Keyed by authored question
 * NUMBER because the numbering carries meaning: Q13 is intentionally
 * unused and must NEVER be asked, and Q11 is conditional on Q10's answer.
 * Every other structure below (Set 1, Set 2, ALL, the call opening, the
 * directive, the sequencing tool, the UI) derives from this one list.
 */
export interface AuthoredQuestion {
  readonly number: number;
  readonly question: string;
}

export const TAMIL_QUALIFICATION_QUESTIONS: readonly AuthoredQuestion[] = [
  { number: 1, question: "உங்கள் வணிகத்தில் தீர்வு காண வேண்டிய குறிப்பிட்ட பிரச்சினை உள்ளதா?" },
  { number: 2, question: "இந்தப் பிரச்சினை 3 மாதங்களுக்கு மேல் உள்ளதா?" },
  { number: 3, question: "இதற்கு முன் வேறு தீர்வு முயற்சி செய்தீர்களா?" },
  { number: 4, question: "இந்த முடிவை தாங்கள் மட்டும் எடுக்க முடியுமா?" },
  { number: 5, question: "தாங்கள் நினைத்திருக்கும் தொகை எங்கள் விலை வரம்பிற்குள் உள்ளதா?" },
  { number: 6, question: "இதை இந்த மாதத்திற்குள் தொடங்க எண்ணியுள்ளீர்களா?" },
  { number: 7, question: "இது தங்களுக்கு இப்போதே தேவையானதா?" },
  { number: 8, question: "இந்தத் தீர்வு உங்கள் வணிகத்திற்கு பயனுள்ளதாக இருக்கும் என நினைக்கிறீர்களா?" },
  { number: 9, question: "தரம்/வேகம் தங்களுக்கு விலையை விட முக்கியமா?" },
  { number: 10, question: "முன்னேற தங்களைத் தடுக்கும் ஏதேனும் காரணம் உள்ளதா?" },
  { number: 11, question: "அது விலை தொடர்பானதா?" },
  { number: 12, question: "இன்றே முடிவெடுக்க தாங்கள் தயாரா?" },
  // Q13 is INTENTIONALLY ABSENT — reserved/unused by the product owner.
  { number: 14, question: "இது ஒரு பரிந்துரையின் மூலம் வந்ததா?" },
  { number: 15, question: "உங்கள் பகுதியில் உள்ள வாடிக்கையாளர்களுடன் இணைக்க விரும்புகிறீர்களா?" },
  { number: 16, question: "இப்போது, இதை முன்னெடுத்துச் செல்ல, தங்கள் வசதிக்கேற்ப ஒரு நேரத்தைப் பதிவு செய்ய எங்கள் காலெண்டரைக் காட்டட்டுமா?" },
  { number: 17, question: "இவ்வாறு தொடரலாமா?" },
] as const;

export function getAuthoredQuestion(number: number): AuthoredQuestion | null {
  return TAMIL_QUALIFICATION_QUESTIONS.find((q) => q.number === number) ?? null;
}

/** Set 1 — Lead Qualification (Q1-Q7), derived from the master list. */
export const TAMIL_QUALIFICATION_SET1: readonly string[] = TAMIL_QUALIFICATION_QUESTIONS.filter((q) => q.number <= 7).map((q) => q.question);

/** Set 2 — Lead Conversion (Q8-Q17, no Q13), derived from the master list. */
export const TAMIL_QUALIFICATION_SET2: readonly string[] = TAMIL_QUALIFICATION_QUESTIONS.filter((q) => q.number >= 8).map((q) => q.question);

/**
 * The mandatory closed-answer guidance, spoken after EVERY question: the
 * visitor must answer with exactly ஆம் (YES), இல்லை (NO) or இருந்தாலும்
 * (MAYBE) — the questionnaire is closed-ended, never an open conversation.
 * Authored wording; tests pin it.
 */
export const TAMIL_ANSWER_GUIDANCE = "ஆம், இல்லை அல்லது இருந்தாலும் என பதிலளிக்கவும்.";

/** A question as actually spoken: the authored text followed by the
 * closed-answer guidance. */
export function withAnswerGuidance(question: string): string {
  return `${question}\n\n${TAMIL_ANSWER_GUIDANCE}`;
}

/**
 * The qualification call's ACTUAL opening: EXACTLY Question 1 followed by
 * the closed-answer guidance — derived from the master list, so the
 * opening and the questionnaire can never drift apart. No founder pitch,
 * no greeting, no preamble, no filler: the first spoken content after
 * "Start AI Conversation" IS Q1, and the directive tells the AI the
 * opening already asked Q1 (never repeat it; the visitor's first reply is
 * Q1's answer).
 */
export const TAMIL_QUALIFICATION_CALL_OPENING = withAnswerGuidance(TAMIL_QUALIFICATION_SET1[0]);

/**
 * Strict closed-ended classification of the visitor's RAW Tamil response.
 * Accepts ONLY ஆம்/இல்லை/இருந்தாலும் (with common ASR spelling drift) —
 * possibly repeated ("ஆம் ஆம்") — and returns null for anything else,
 * including sentences that merely CONTAIN a permitted word ("ஆம்,
 * இருக்கிறது"), English ("maybe", "yes we have a problem"), fillers
 * ("சரி") and don't-know answers. null means: do NOT advance, do NOT
 * store — re-speak the guidance and listen again. This runs SERVER-side
 * (the sequencing tool); the model is never trusted to classify.
 */
const CLOSED_ANSWER_TOKENS: Record<string, "YES" | "NO" | "MAYBE"> = {
  // YES — ஆம் and ASR variants (dropped pulli, colloquial ஆமாம்/ஆமா)
  "ஆம்": "YES",
  "ஆம": "YES",
  "ஆமாம்": "YES",
  "ஆமாம": "YES",
  "ஆமா": "YES",
  // NO — இல்லை and ASR variants
  "இல்லை": "NO",
  "இல்லெ": "NO",
  "இல்ல": "NO",
  "இல்லே": "NO",
  "இல்லைங்க": "NO",
  // MAYBE — இருந்தாலும் and ASR variants
  "இருந்தாலும்": "MAYBE",
  "இருந்தாலும": "MAYBE",
};

export function classifyClosedTamilResponse(raw: string): "YES" | "NO" | "MAYBE" | null {
  const tokens = raw
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

/** Every authored question, in asking order — the UI's authoritative
 * source for "which question is on screen right now". */
export const ALL_TAMIL_QUESTIONS: readonly string[] = TAMIL_QUALIFICATION_QUESTIONS.map((q) => q.question);

const normalize = (s: string) => s.replace(/[?？.!,]/g, "").replace(/\s+/g, " ").trim();

/**
 * Matches a live assistant transcript against the authored question list
 * and returns the EXACT authored wording (never the transcript's own
 * rendering of it) — the UI must always display the authoritative text,
 * not an ASR/TTS-roundtripped paraphrase. Tolerant of punctuation and
 * whitespace drift, and of the closed-answer guidance that is spoken
 * after every question; null when the utterance isn't one of the
 * authored questions.
 */
export function matchAuthoredTamilQuestion(transcript: string): string | null {
  const guidance = normalize(TAMIL_ANSWER_GUIDANCE);
  const t = normalize(transcript).split(guidance).join(" ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const q of ALL_TAMIL_QUESTIONS) {
    const nq = normalize(q);
    if (t.includes(nq) || nq.includes(t)) return q;
  }
  return null;
}

/**
 * The system-prompt section injected for Tamil sessions. Written in
 * English (instructions ABOUT the script don't need to be Tamil) with the
 * authored questions embedded verbatim. Progression, the Q10->Q11
 * condition, the Q13 gap, and COLD routing are ALL enforced server-side
 * by get_next_qualification_question — this text tells the model its
 * contract with that tool.
 */
export function getTamilQualificationDirective(): string {
  const numbered = TAMIL_QUALIFICATION_QUESTIONS.map((q) => `${q.number}. ${q.question}`).join("\n");
  return (
    `

=== TAMIL QUALIFICATION SCRIPT (booking flow) ===
` +
    `This is a STRICT CLOSED-ENDED questionnaire, not a conversation. Ask ONLY the authored questions below, one ` +
    `at a time, EXACTLY as written — never translate, paraphrase, shorten, reword or renumber them, and never ` +
    `invent a question. There is deliberately no question 13 — never ask one. ` +
    `After EVERY question you must say exactly: "${TAMIL_ANSWER_GUIDANCE}" — the visitor may only answer ` +
    `ஆம் (yes), இல்லை (no) or இருந்தாலும் (maybe). Never ask for explanations or open-ended answers. ` +
    `The call's opening ALREADY asked question 1 plus that guidance — do NOT repeat it and do NOT add any ` +
    `greeting or preamble; the visitor's first reply is the answer to question 1. Never replay the founder pitch ` +
    `or any elevator/product/USP content during qualification.

` +
    `AFTER EVERY VISITOR REPLY you MUST:
` +
    `1. Call get_next_qualification_question with: last_answered_question (the number of the question they just ` +
    `replied to), user_response (the visitor's words EXACTLY as you heard them, in Tamil — never cleaned up, ` +
    `never translated, never invented), and the lead_id from save_lead.
` +
    `2. You do NOT classify and you do NOT judge validity — the SERVER decides whether the reply is YES, NO or ` +
    `MAYBE. If the server returns action "reprompt", the answer was not valid: SPEAK the returned text verbatim ` +
    `(the guidance line), stay on the SAME question, and listen again. Never advance past an unaccepted answer ` +
    `and never invent a classification.
` +
    `3. When the server returns the next question, SPEAK its "speak" text EXACTLY as returned (it already ends ` +
    `with the guidance line). Obey its action field: "complete_proceed_to_booking" means move to booking — ` +
    `warmly invite them to pick a time on screen, or collect Name/Email/Phone and use book_appointment.
` +
    `4. After an ACCEPTED answer you may also mirror it into the lead via update_lead_qualification (decision ` +
    `authority -> decision_maker; budget fit -> budget; timing -> timeline; urgency -> urgency and buying_intent; ` +
    `obstacles -> objections) using only the question asked and the server's accepted YES/NO/MAYBE — never ` +
    `invented content.

` +
    `If the visitor is silent: do NOT call the tool — repeat the guidance and listen again. The sequencing ` +
    `(including whether question 11 is asked, and where COLD leads go) is decided entirely by the tool — never ` +
    `skip a question it returned and never ask one it did not return. The visitor may stop or skip to booking at ` +
    `ANY point — never trap them.

` +
    `THE AUTHORED QUESTIONS:
${numbered}`
  );
}
