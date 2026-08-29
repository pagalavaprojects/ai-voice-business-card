import {
  QUALIFICATION_QUESTIONS,
  QUALIFICATION_QUESTIONS_TA,
  QUALIFICATION_ANSWER_GUIDANCE,
  QUALIFICATION_ANSWER_GUIDANCE_TA,
  QUALIFICATION_CONTINUE_PROMPT,
  QUALIFICATION_CONTINUE_PROMPT_TA,
  getQualificationDirective,
  getQualificationCallOpening,
  getQuickReplyOptions,
} from "@/features/voice/lib/qualificationScript";

/**
 * Filler speech during the booking questionnaire.
 *
 * Reported from a real call: between answering a question and hearing the
 * next one, the assistant was saying things like "one moment" and "give me a
 * moment". Nothing in this codebase produces those words — no tool message,
 * no configured filler — so they are the model improvising while it waits for
 * the sequencing tool, which the directive never forbade.
 *
 * The fix is a rule in the directive, so these tests guard the rule: that the
 * prohibition is actually there, that it is scoped to the questionnaire, and
 * that adding it did not disturb a single word of the approved script.
 */

const FILLER = [
  "one moment",
  "just a moment",
  "give me a moment",
  "please wait",
  "hold on",
  "let me check",
];

describe("the qualification directive forbids filler", () => {
  it.each(["en", "ta"] as const)("tells the model to stay silent while the tool runs (%s)", (language) => {
    const directive = getQualificationDirective(language).toLowerCase();
    expect(directive).toContain("say nothing while the tool is running");
    expect(directive).toContain("you are silent");
  });

  it.each(["en", "ta"] as const)("names the phrases that were actually heard (%s)", (language) => {
    const directive = getQualificationDirective(language).toLowerCase();
    for (const phrase of FILLER) {
      expect(directive).toContain(phrase);
    }
  });

  it.each(["en", "ta"] as const)("closes the loophole of filler in another language (%s)", (language) => {
    expect(getQualificationDirective(language).toLowerCase()).toContain("in any language");
  });

  it.each(["en", "ta"] as const)("enumerates the only speech the questionnaire permits (%s)", (language) => {
    const directive = getQualificationDirective(language).toLowerCase();
    // An allow-list, not just a deny-list: novel filler is covered too.
    expect(directive).toContain("the only words you may ever speak during qualification");
    expect(directive).toContain("no transition phrase between them");
  });
});

describe("the approved script is untouched", () => {
  it("keeps all six English questions byte-identical", () => {
    expect(QUALIFICATION_QUESTIONS.map((q) => q.question)).toEqual([
      "Is our service or product something you need immediately?",
      "Have you set aside a specific budget for this already?",
      "Do you believe our service or product will be useful for your business?",
      "Is there anything holding you back — for example, price or timing?",
      "Are you ready to decide today?",
      "Shall I show you our calendar now, so we can book a convenient time to move this forward?",
    ]);
  });

  it("keeps all six Tamil questions byte-identical", () => {
    expect(QUALIFICATION_QUESTIONS_TA.map((q) => q.question)).toEqual([
      "எங்கள் சேவை அல்லது தயாரிப்பு உங்களுக்கு உடனடியாகத் தேவைப்படுகிறதா?",
      "இதற்காக ஒரு குறிப்பிட்ட பட்ஜெட்டை ஏற்கனவே ஒதுக்கி வைத்துள்ளீர்களா?",
      "எங்கள் சேவை அல்லது தயாரிப்பு உங்கள் வணிகத்திற்குப் பயனுள்ளதாக இருக்கும் என்று நம்புகிறீர்களா?",
      "உங்களைத் தயங்க வைக்கும் ஏதேனும் இருக்கிறதா — உதாரணமாக, விலை அல்லது நேரம்?",
      "இன்றே முடிவெடுக்கத் தயாராக இருக்கிறீர்களா?",
      "இதை முன்னெடுக்க வசதியான நேரத்தைப் பதிவு செய்ய, இப்போது எங்கள் காலெண்டரைக் காட்டட்டுமா?",
    ]);
  });

  it("keeps the guidance and completion lines byte-identical", () => {
    expect(QUALIFICATION_ANSWER_GUIDANCE).toBe("Please answer with Yes, No, or Maybe.");
    expect(QUALIFICATION_ANSWER_GUIDANCE_TA).toBe("தயவுசெய்து ஆம், இல்லை அல்லது இருந்தாலும் என்று மட்டும் பதில் சொல்லுங்கள்.");
    expect(QUALIFICATION_CONTINUE_PROMPT).toBe("Please Click to Continue");
    expect(QUALIFICATION_CONTINUE_PROMPT_TA).toBe("தொடர்வதற்கு, திரையில் உள்ள Continue பொத்தானை அழுத்துங்கள்.");
  });

  it("keeps the quick-reply labels byte-identical", () => {
    expect(getQuickReplyOptions("en").map((o) => o.label)).toEqual(["Yes", "No", "Maybe"]);
    expect(getQuickReplyOptions("ta").map((o) => o.label)).toEqual(["ஆம்", "இல்லை", "இருந்தாலும்"]);
  });

  it("still opens on question one plus its guidance, and nothing else", () => {
    expect(getQualificationCallOpening("en")).toBe(`${QUALIFICATION_QUESTIONS[0].question}\n\n${QUALIFICATION_ANSWER_GUIDANCE}`);
    expect(getQualificationCallOpening("ta")).toBe(`${QUALIFICATION_QUESTIONS_TA[0].question}\n\n${QUALIFICATION_ANSWER_GUIDANCE_TA}`);
    // No greeting, no preamble, no filler in the opening itself.
    for (const phrase of FILLER) {
      expect(getQualificationCallOpening("en").toLowerCase()).not.toContain(phrase);
      expect(getQualificationCallOpening("ta").toLowerCase()).not.toContain(phrase);
    }
  });
});

describe("scope", () => {
  it("lives only in the questionnaire directive, not in general conversation", () => {
    // The directive is appended to the base prompt for the booking call only;
    // a general "Talk with AI" conversation never receives it, so ordinary
    // conversational language there is unaffected.
    const directive = getQualificationDirective("en");
    expect(directive).toContain("=== QUALIFICATION SCRIPT (booking flow) ===");
    expect(directive.indexOf("SAY NOTHING WHILE THE TOOL IS RUNNING")).toBeGreaterThan(
      directive.indexOf("=== QUALIFICATION SCRIPT (booking flow) ===")
    );
  });

  it("still carries the language lock and the authored question list", () => {
    expect(getQualificationDirective("ta")).toContain("TAMIL ONLY");
    for (const question of QUALIFICATION_QUESTIONS_TA) {
      expect(getQualificationDirective("ta")).toContain(question.question);
    }
  });
});
