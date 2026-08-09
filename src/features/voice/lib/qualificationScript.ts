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
 * The qualification call's ACTUAL opening line. Deliberately short — the
 * founder pitch above belongs to the public-card/pitch experience and must
 * NEVER replay after "Book an Appointment". This states the purpose (a few
 * quick questions, answer naturally, skip to booking any time) and then
 * asks QUESTION 1 VERBATIM as part of the opening itself, so reaching Q1
 * is deterministic — not dependent on the model deciding to begin.
 */
export const TAMIL_QUALIFICATION_CALL_OPENING =
  "வணக்கம்! உங்கள் சந்திப்பை உறுதி செய்யும் முன், உங்கள் தேவைகளை சரியாக புரிந்துகொள்ள சில சிறிய கேள்விகள் கேட்கப்போகிறேன். " +
  "இயல்பாக பதிலளித்தால் போதும் — விருப்பமில்லை என்றால் எந்த நேரத்திலும் நேரடியாக நேரத்தைத் தேர்வு செய்யலாம். " +
  "முதல் கேள்வி: உங்கள் வணிகத்தில் முதன்மையாகத் தீர்வு காண விரும்பும் பிரச்சினை என்ன?";

/** Set 1 — Lead Qualification. Asked in order, verbatim. */
export const TAMIL_QUALIFICATION_SET1: readonly string[] = [
  "உங்கள் வணிகத்தில் முதன்மையாகத் தீர்வு காண விரும்பும் பிரச்சினை என்ன?",
  "இந்தப் பிரச்சினை உங்கள் வணிகத்தை எவ்வளவு காலமாக பாதித்து வருகிறது?",
  "இதற்கு முன் வேறு ஏதேனும் தீர்வு முயற்சி செய்தீர்களா?",
  "இந்த முடிவை தாங்கள் மட்டும் எடுப்பீர்களா, அல்லது வேறு யாரேனும் இதில் இணைந்திருப்பார்களா?",
  "தாங்கள் மனதில் கொண்டுள்ள தோராயமான பட்ஜெட்டைத் தெரிவிக்க முடியுமா?",
  "இதைத் தொடங்க/வாங்க தாங்கள் எப்பொழுது எண்ணியுள்ளீர்கள்?",
  "இது தங்களுக்கு எவ்வளவு முக்கியத்துவம் வாய்ந்தது — இப்போதே தேவையா, அல்லது யோசிக்கலாமா?",
] as const;

/** Set 2 — Lead Conversion / closing. HOT/WARM leads only, in order, verbatim. */
export const TAMIL_QUALIFICATION_SET2: readonly string[] = [
  "இந்தத் தீர்வு உங்களுக்குக் கிடைத்தால், உங்கள் வணிகத்தில் என்ன மாற்றத்தை எதிர்பார்க்கிறீர்கள்?",
  "விலை, தரம், வேகம் — இவற்றில் தங்களுக்கு எது மிக முக்கியம்?",
  "முன்னேற தங்களைத் தடுக்கக்கூடிய ஏதேனும் காரணம் இருக்கிறதா?",
  "இது விலையா, நேரமா, அல்லது வேறு ஏதேனும் காரணமா?",
  "இது குறித்து முடிவெடுக்க தங்களுக்கு எவ்வளவு காலஅவகாசம் தேவைப்படும்?",
  "இன்று இதற்கு சம்மதிக்க என்ன தேவைப்படும்?",
  "இதைக் குறித்து தங்களுக்கு யார் தெரிவித்தார்கள்?",
  "உங்கள் பகுதியில் உள்ள வேறு வாடிக்கையாளர்களுடன் இணைக்க வேண்டுமா?",
  "இப்போது, இதை முன்னெடுத்துச் செல்ல, தங்கள் வசதிக்கேற்ப ஒரு நேரத்தைப் பதிவு செய்ய எங்கள் காலெண்டரைக் காட்டட்டுமா?",
  "இவ்வாறு தொடரலாமா?",
] as const;

/**
 * The system-prompt section injected for Tamil sessions. Written in English
 * (instructions ABOUT the script don't need to be in Tamil — same
 * reasoning as getLanguageDirective) with the authored questions embedded
 * verbatim. It layers ON TOP of the existing sales/booking modules: the
 * conversational engine, scoring, tools and HOT/WARM/COLD routing all stay
 * exactly as deployed — this only fixes WHICH questions are asked and in
 * WHAT order during the booking-qualification conversation.
 */
export function getTamilQualificationDirective(): string {
  const set1 = TAMIL_QUALIFICATION_SET1.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const set2 = TAMIL_QUALIFICATION_SET2.map((q, i) => `${i + 8}. ${q}`).join("\n");
  return (
    `\n\n=== TAMIL QUALIFICATION SCRIPT (booking flow) ===\n` +
    `When the visitor is being qualified for an appointment, ask the following authored questions IN ORDER, ` +
    `one at a time, EXACTLY as written — do not translate, paraphrase, shorten, reword or renumber them. ` +
    `If the call's opening line already asked question 1 ("முதல் கேள்வி: ..."), do NOT repeat it — treat the ` +
    `visitor's first reply as the answer to question 1. Never replay the founder ` +
    `pitch or any elevator/product/USP content during qualification. If the visitor declines a question, ` +
    `acknowledge it naturally, record nothing invented, and move on — never end or restart ` +
    `the qualification because of a refusal. ` +
    `PROGRESSION IS TOOL-DRIVEN, NOT FROM MEMORY: after storing each answer, you MUST call ` +
    `get_next_qualification_question with the number of the question just answered (and the lead_id from ` +
    `save_lead), then speak the returned question EXACTLY as given. Obey its action field: ` +
    `"cold_proceed_to_booking" means skip the remaining questions and warmly invite them to pick a time on ` +
    `screen; "complete_proceed_to_booking" means move to booking. Never skip a question the tool returned and ` +
    `never invent a question the tool did not return. ` +
    `After each answer: listen fully, then record what they actually said via save_lead / update_lead_qualification ` +
    `(map naturally: problem -> problem_statement; prior attempts -> current_solution; decision authority -> decision_maker; ` +
    `budget -> budget; start timing -> timeline; importance/urgency -> urgency and buying_intent; obstacles/reasons -> objections ` +
    `and, when clearly blocking, cold_reason; who told them -> referral_source; everything else informative -> qualification_notes). ` +
    `Never invent an answer the visitor did not give. Then ask the next question.\n\n` +
    `SET 1 — LEAD QUALIFICATION (every visitor):\n${set1}\n\n` +
    `After Set 1, the tools return the lead's temperature. If it is HOT or WARM, continue with Set 2. ` +
    `If it is COLD, SKIP Set 2 entirely — never push a cold lead through closing questions — thank them warmly and ` +
    `invite them to pick an appointment time anyway; a COLD lead must always still be able to book.\n\n` +
    `SET 2 — LEAD CONVERSION (HOT/WARM only):\n${set2}\n\n` +
    `Questions 16-17 ask consent to show the calendar; on a yes, proceed to booking (collect Name, Email, Phone and use ` +
    `book_appointment, or tell them they can pick a time on screen). The visitor may stop or skip at ANY point — never ` +
    `trap them; if they want to book immediately, let them.`
  );
}
